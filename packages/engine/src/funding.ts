/**
 * Funding order, construction interest and the fixed point (7.6).
 *
 * For each month t ≤ R the net requirement need_t = costs_t − inflows_t (with surplus inflow carried
 * forward) is funded in order: equity until the commitment E is exhausted, then mezzanine until M
 * is exhausted, then the construction loan. Interest is capitalized monthly on every loan and is a
 * project cost, so TPC, Lc = ltc × TPC and E = TPC − Lc − M are solved by fixed-point iteration.
 */
import { EngineError } from './errors';
import type { CostSchedule } from './costs';
import { zeros } from './math';
import type { DealInputs } from './schema';
import type { Timeline } from './timeline';
import type { CostCategory } from './types';
import { COST_CATEGORIES } from './types';

export interface FundingMonth {
  costs: Record<CostCategory, number>;
  costTotal: number;
  inflows: number;
  /** Positive NOI before R applied to this month's requirement (after carry-forward). */
  leaseUpNoiApplied: number;
  equityCashGp: number;
  equityCashLp: number;
  equityInKind: number;
  /** Non-capitalized operating deficit funded by equity pro rata (when capitalizeOperatingDeficits is off). */
  deficitContributionGp: number;
  deficitContributionLp: number;
  mezzDraw: number;
  loanDraw: number;
  landLoanDraw: number;
  interestConstruction: number;
  interestLand: number;
  interestMezz: number;
  loanBalance: number;
  landLoanBalance: number;
  mezzBalance: number;
  /** Surplus carried into the next month. */
  surplusCarry: number;
}

export interface FundingResult {
  months: FundingMonth[];
  tpc: number;
  lc: number;
  mezzCommitment: number;
  equityCommitment: number;
  iterations: number;
  fees: { land: number; construction: number; mezz: number; total: number };
  interest: { construction: number; land: number; mezz: number; total: number };
  equityCash: number;
  equityInKind: number;
  operatingDeficitCapitalized: number;
  /** Total positive NOI before R applied to the funding requirement. */
  leaseUpNoiApplied: number;
  inflowsApplied: number;
  /** Inflows plus positive NOI that exceeded every remaining requirement; distributed at R. */
  surplusAtR: number;
  loanBalanceAtR: number;
  mezzBalanceAtR: number;
  mezzFirstDrawMonth: number | null;
  /** Diagnostics: TPC in/out per iteration. */
  trace: Array<{ tpcIn: number; tpcOut: number }>;
}

interface PassParams {
  tpcIn: number;
  lc: number;
  mezzCommitment: number;
  equityCommitment: number;
}

function emptyCosts(): Record<CostCategory, number> {
  const out = {} as Record<CostCategory, number>;
  for (const c of COST_CATEGORIES) out[c] = 0;
  return out;
}

/**
 * One pass of the monthly schedule with given commitments. Pure; returns every monthly row and
 * the totals that feed the next fixed-point iteration.
 */
function runPass(inputs: DealInputs, tl: Timeline, cost: CostSchedule, noi: readonly number[], p: PassParams) {
  const n = cost.monthCount;
  const fin = inputs.financing;
  const rc = fin.constructionLoan.ratePct / 12;
  const rl = fin.landLoan.ratePct / 12;
  const rm = fin.mezz.ratePct / 12;
  const gpPct = inputs.equity.gpPct;
  const lpPct = inputs.equity.lpPct;
  const landLoanOn = fin.landLoan.enabled && !inputs.site.landOwned && inputs.site.landCost > 0;
  const landLoanPrincipal = landLoanOn ? fin.landLoan.ltv * inputs.site.landCost : 0;
  const landFee = landLoanPrincipal * fin.landLoan.feePct;
  const constructionFee = p.lc * fin.constructionLoan.feePct;
  const mezzOn = fin.mezz.enabled && p.mezzCommitment > 0;
  const capitalize = fin.capitalizeOperatingDeficits;

  const months: FundingMonth[] = [];
  let loanBalance = 0;
  let landBalance = 0;
  let mezzBalance = 0;
  let equityRemaining = p.equityCommitment;
  let mezzRemaining = p.mezzCommitment;
  let mezzFirstDrawMonth: number | null = null;
  let carry = 0;
  let equityCash = 0;
  let equityInKind = 0;
  let deficitCapitalized = 0;
  let totalInflowsAndNoi = 0;
  const interest = { construction: 0, land: 0, mezz: 0 };
  let mezzFee = 0;

  for (let t = 0; t < n; t++) {
    const costs = emptyCosts();
    for (const c of COST_CATEGORIES) costs[c] = cost.byCategory[c][t] ?? 0;
    const row: FundingMonth = {
      costs,
      costTotal: 0,
      inflows: cost.inflows[t] ?? 0,
      leaseUpNoiApplied: 0,
      equityCashGp: 0,
      equityCashLp: 0,
      equityInKind: 0,
      deficitContributionGp: 0,
      deficitContributionLp: 0,
      mezzDraw: 0,
      loanDraw: 0,
      landLoanDraw: 0,
      interestConstruction: 0,
      interestLand: 0,
      interestMezz: 0,
      loanBalance,
      landLoanBalance: landBalance,
      mezzBalance,
      surplusCarry: carry,
    };

    const development = t <= tl.R;
    if (development) {
      // Interest on prior balances, capitalized (7.6). No interest accrues in month 0.
      if (t > 0) {
        row.interestConstruction = loanBalance * rc;
        row.interestLand = landBalance * rl;
        row.interestMezz = mezzBalance * rm;
        loanBalance += row.interestConstruction;
        landBalance += row.interestLand;
        mezzBalance += row.interestMezz;
        interest.construction += row.interestConstruction;
        interest.land += row.interestLand;
        interest.mezz += row.interestMezz;
        costs.capitalizedInterest += row.interestConstruction + row.interestLand + row.interestMezz;
      }

      // Financing fees that are known a priori.
      if (t === 0 && landLoanOn) costs.financingFees += landFee;
      if (t === tl.P) costs.financingFees += constructionFee;

      // Operating deficits before R (7.7): capitalized as a project cost, or an equity contribution pro rata.
      const noiT = noi[t] ?? 0;
      let noiPositive = 0;
      if (t >= tl.O && t < tl.R) {
        if (noiT < 0) {
          if (capitalize) {
            costs.operatingDeficit += -noiT;
            deficitCapitalized += -noiT;
          } else {
            row.deficitContributionGp = -noiT * gpPct;
            row.deficitContributionLp = -noiT * lpPct;
          }
        } else {
          noiPositive = noiT;
        }
      }

      let costTotal = 0;
      for (const c of COST_CATEGORIES) costTotal += costs[c];

      // Net requirement after inflows, positive NOI and carried surplus. Capitalized interest is a
      // cost but not a cash requirement: it accrues into the loan balances directly.
      const cashIn = row.inflows + noiPositive + carry;
      totalInflowsAndNoi += row.inflows + noiPositive;
      const cashCosts = costTotal - costs.capitalizedInterest;
      let need = cashCosts - cashIn;
      if (need < 0) {
        carry = -need;
        need = 0;
      } else {
        carry = 0;
      }
      row.leaseUpNoiApplied = noiPositive;

      // Land loan draw at month 0 (specific to land), rolled into the construction loan at P.
      if (t === 0 && landLoanOn) {
        const draw = Math.min(landLoanPrincipal, need);
        row.landLoanDraw = draw;
        landBalance += draw;
        need -= draw;
      }

      // In-kind land (GP) at month 0 counts toward E.
      if (t === 0 && inputs.site.landOwned && inputs.site.landCost > 0) {
        const inKind = Math.min(inputs.site.landCost, need);
        row.equityInKind = inKind;
        equityInKind += inKind;
        equityRemaining = Math.max(0, equityRemaining - inKind);
        need -= inKind;
      }

      // Equity, then mezzanine (fee at first draw), then the construction loan.
      const eq = Math.min(need, Math.max(0, equityRemaining));
      row.equityCashGp = eq * gpPct;
      row.equityCashLp = eq * lpPct;
      equityCash += eq;
      equityRemaining -= eq;
      need -= eq;

      if (need > 0 && mezzOn && mezzRemaining > 0) {
        if (mezzFirstDrawMonth === null) {
          mezzFirstDrawMonth = t;
          mezzFee = p.mezzCommitment * fin.mezz.feePct;
          costs.financingFees += mezzFee;
          costTotal += mezzFee;
          need += mezzFee;
        }
        const md = Math.min(need, mezzRemaining);
        row.mezzDraw = md;
        mezzBalance += md;
        mezzRemaining -= md;
        need -= md;
      }

      if (need > 0) {
        row.loanDraw += need;
        loanBalance += need;
      }

      // Roll the land loan into the construction loan at P (a draw at P).
      if (t === tl.P && landBalance > 0) {
        row.loanDraw += landBalance;
        loanBalance += landBalance;
        landBalance = 0;
      }

      row.costTotal = costTotal;
    } else {
      row.costTotal = 0;
    }

    row.loanBalance = loanBalance;
    row.landLoanBalance = landBalance;
    row.mezzBalance = mezzBalance;
    row.surplusCarry = carry;
    months.push(row);
  }

  // Surplus left at R was never needed; it is distributed at R, not a source of funding.
  const surplusAtR = months[tl.R]?.surplusCarry ?? 0;
  const applied = totalInflowsAndNoi - surplusAtR;
  const totalInflows = cost.inflows.reduce((a, b) => a + b, 0);
  const inflowsApplied = Math.min(totalInflows, applied);
  const leaseUpNoiApplied = applied - inflowsApplied;

  const fees = { land: landLoanOn ? landFee : 0, construction: constructionFee, mezz: mezzFee, total: 0 };
  fees.total = fees.land + fees.construction + fees.mezz;
  const interestTotal = interest.construction + interest.land + interest.mezz;
  let tpcOut = 0;
  for (let t = 0; t <= tl.R && t < n; t++) tpcOut += months[t]!.costTotal;

  return {
    months,
    tpcOut,
    fees,
    interest: { ...interest, total: interestTotal },
    equityCash,
    equityInKind,
    deficitCapitalized,
    leaseUpNoiApplied,
    inflowsApplied,
    surplusAtR,
    loanBalanceAtR: months[tl.R]?.loanBalance ?? 0,
    mezzBalanceAtR: months[tl.R]?.mezzBalance ?? 0,
    mezzFirstDrawMonth,
  };
}

export function solveFunding(inputs: DealInputs, tl: Timeline, cost: CostSchedule, noi: readonly number[]): FundingResult {
  const fin = inputs.financing;
  const ltc = fin.constructionLoan.ltc;
  const mezzPct = fin.mezz.enabled ? fin.mezz.pctOfCost : 0;

  // Fixed part of TPC: every non-financing line through R plus capitalized deficits.
  let fixed = 0;
  for (let t = 0; t <= tl.R && t < cost.monthCount; t++) {
    for (const c of COST_CATEGORIES) fixed += cost.byCategory[c][t] ?? 0;
  }
  if (fin.capitalizeOperatingDeficits) {
    for (let t = tl.O; t < tl.R; t++) fixed += Math.max(0, -(noi[t] ?? 0));
  }
  const landLoanOn = fin.landLoan.enabled && !inputs.site.landOwned && inputs.site.landCost > 0;
  const landFee = landLoanOn ? fin.landLoan.ltv * inputs.site.landCost * fin.landLoan.feePct : 0;

  // Start with interest = 0; fees are solved in closed form for the first guess.
  const feeFactor = 1 - ltc * fin.constructionLoan.feePct - mezzPct * fin.mezz.feePct;
  let tpcIn = (fixed + landFee) / feeFactor;
  const trace: Array<{ tpcIn: number; tpcOut: number }> = [];

  for (let k = 1; k <= 50; k++) {
    const lc = ltc * tpcIn;
    const mezzCommitment = mezzPct * tpcIn;
    const equityCommitment = tpcIn - lc - mezzCommitment;
    const pass = runPass(inputs, tl, cost, noi, { tpcIn, lc, mezzCommitment, equityCommitment });
    trace.push({ tpcIn, tpcOut: pass.tpcOut });
    if (Math.abs(pass.tpcOut - tpcIn) < 1) {
      return {
        months: pass.months,
        tpc: pass.tpcOut,
        lc,
        mezzCommitment,
        equityCommitment,
        iterations: k,
        fees: pass.fees,
        interest: pass.interest,
        equityCash: pass.equityCash,
        equityInKind: pass.equityInKind,
        operatingDeficitCapitalized: pass.deficitCapitalized,
        leaseUpNoiApplied: pass.leaseUpNoiApplied,
        inflowsApplied: pass.inflowsApplied,
        surplusAtR: pass.surplusAtR,
        loanBalanceAtR: pass.loanBalanceAtR,
        mezzBalanceAtR: pass.mezzBalanceAtR,
        mezzFirstDrawMonth: pass.mezzFirstDrawMonth,
        trace,
      };
    }
    tpcIn = pass.tpcOut;
  }
  throw new EngineError('non-convergent', 'total project cost did not converge in 50 iterations', {
    lastIterations: trace.slice(-2),
  });
}

export function zeroNoi(monthCount: number): number[] {
  return zeros(monthCount);
}
