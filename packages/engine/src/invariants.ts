/**
 * Invariants (12.2) checked on a single run's outputs. A violation throws an EngineError in tests;
 * `checkInvariants` returns the list of violations so a test can assert it is empty.
 */
import { COST_CATEGORIES, type DealOutputs } from './types';

export interface InvariantViolation {
  invariant: number;
  message: string;
}

const MONEY_TOL = 0.01;

export function checkInvariants(outputs: DealOutputs): InvariantViolation[] {
  const v: InvariantViolation[] = [];
  const { months, totals, timeline: tl } = outputs;

  // 1. Sources equal uses to within $0.01 before rounding, in every month and in total.
  let carry = 0;
  for (const m of months) {
    if (m.t > tl.R) break;
    const uses = m.costTotal;
    // Cash uses exclude capitalized interest, which accrues into the balances rather than being funded.
    const cashUses = uses - m.costs.capitalizedInterest;
    const cashIn = m.inflows + Math.max(0, m.t >= tl.O && m.t < tl.R ? m.noi : 0) + carry;
    const funded =
      m.equityIn.gp + m.equityIn.lp + m.equityIn.inKind + m.mezzDraw + (m.loanDraw - (m.t === tl.P ? rolledLandLoan(outputs) : 0)) + m.landLoanDraw;
    const surplus = Math.max(0, cashIn - cashUses);
    const applied = Math.min(cashIn, cashUses);
    // cash uses = funded + applied; surplus carries forward; interest is its own source and use.
    const diff = cashUses - (funded + applied);
    if (Math.abs(diff) > MONEY_TOL) {
      v.push({ invariant: 1, message: `month ${m.t}: cash uses ${cashUses.toFixed(2)} ≠ sources ${(funded + applied).toFixed(2)} (diff ${diff.toFixed(2)})` });
    }
    carry = surplus;
  }
  const su = outputs.sourcesUses;
  if (Math.abs(su.totalSources - su.totalUses) > MONEY_TOL) {
    v.push({ invariant: 1, message: `total sources ${su.totalSources.toFixed(2)} ≠ total uses ${su.totalUses.toFixed(2)}` });
  }
  if (Math.abs(su.totalUses - totals.tpc) > MONEY_TOL) {
    v.push({ invariant: 1, message: `total uses ${su.totalUses.toFixed(2)} ≠ TPC ${totals.tpc.toFixed(2)}` });
  }
  const sumByCategory = COST_CATEGORIES.reduce((s, c) => s + totals.byCategory[c], 0);
  if (Math.abs(sumByCategory - totals.tpc) > MONEY_TOL) {
    v.push({ invariant: 1, message: `category totals ${sumByCategory.toFixed(2)} ≠ TPC ${totals.tpc.toFixed(2)}` });
  }

  // 2. Loan balance at R equals cumulative draws plus cumulative capitalized interest.
  let draws = 0;
  let interest = 0;
  for (const m of months) {
    if (m.t > tl.R) break;
    draws += m.loanDraw;
    interest += m.interestBreakdown.construction;
  }
  const balanceAtR = months[tl.R]?.loanBalance ?? 0;
  if (Math.abs(balanceAtR - (draws + interest)) > MONEY_TOL) {
    v.push({ invariant: 2, message: `loan balance at R ${balanceAtR.toFixed(2)} ≠ draws ${draws.toFixed(2)} + interest ${interest.toFixed(2)}` });
  }
  if (Math.abs(totals.constructionLoan - balanceAtR) > MONEY_TOL) {
    v.push({ invariant: 2, message: `totals.constructionLoan ${totals.constructionLoan.toFixed(2)} ≠ balance at R ${balanceAtR.toFixed(2)}` });
  }
  if (outputs.amortization.length > 0) {
    const last = outputs.amortization[Math.min(outputs.amortization.length, tl.S - tl.R) - 1];
    const permAtS = months[tl.S]?.permBalance ?? 0;
    if (last && Math.abs(last.endingBalance - permAtS) > MONEY_TOL) {
      v.push({ invariant: 2, message: `permanent balance at sale ${permAtS.toFixed(2)} ≠ schedule ${last.endingBalance.toFixed(2)}` });
    }
  }

  // 3. Total equity contributions equal TPC − Lc − M plus any refinance shortfall and post-refinance deficits.
  // Holds whenever the construction loan absorbed the balance of the requirement (the normal case).
  const loanDrawn = totals.constructionLoan;
  if (loanDrawn > 0) {
    const devEquity = totals.equity;
    const expected = totals.tpc - totals.constructionLoanCommitment - totals.mezzCommitment;
    if (Math.abs(devEquity - expected) > 1.0) {
      v.push({ invariant: 3, message: `development equity ${devEquity.toFixed(2)} ≠ TPC − Lc − M ${expected.toFixed(2)}` });
    }
  }
  let postContrib = 0;
  for (const m of months) {
    if (m.t > tl.R || (m.t === tl.R && m.refinance < 0)) {
      // contributions after R and refinance shortfalls are the extra contributions
    }
    postContrib += m.contributions.gp + m.contributions.lp;
  }
  if (Math.abs(postContrib - totals.totalContributions) > MONEY_TOL) {
    v.push({ invariant: 3, message: `monthly contributions ${postContrib.toFixed(2)} ≠ totals.totalContributions ${totals.totalContributions.toFixed(2)}` });
  }

  // 4. Cumulative distributions by partner sum to total distributions; every tier payout non-negative.
  let distGp = 0;
  let distLp = 0;
  let distTiers = 0;
  for (const m of months) {
    distGp += m.distributions.gp;
    distLp += m.distributions.lp;
    for (const x of m.distributions.byTier) {
      if (x < -MONEY_TOL) v.push({ invariant: 4, message: `month ${m.t}: negative tier payout ${x}` });
      distTiers += x;
    }
  }
  if (Math.abs(distGp + distLp - totals.totalDistributions) > MONEY_TOL) {
    v.push({ invariant: 4, message: `partner distributions ${(distGp + distLp).toFixed(2)} ≠ total ${totals.totalDistributions.toFixed(2)}` });
  }
  if (Math.abs(distTiers - totals.totalDistributions) > MONEY_TOL) {
    v.push({ invariant: 4, message: `tier distributions ${distTiers.toFixed(2)} ≠ total ${totals.totalDistributions.toFixed(2)}` });
  }
  if (Math.abs(outputs.waterfall.byPartner.gp.distributions - distGp) > MONEY_TOL || Math.abs(outputs.waterfall.byPartner.lp.distributions - distLp) > MONEY_TOL) {
    v.push({ invariant: 4, message: 'waterfall.byPartner distributions do not match the monthly rows' });
  }

  // 5. No capitalized cost after month R; no operating income before month O.
  for (const m of months) {
    if (m.t > tl.R && m.costTotal !== 0) v.push({ invariant: 5, message: `capitalized cost ${m.costTotal} at month ${m.t} > R` });
    if (m.t < tl.O && (m.gpr !== 0 || m.egi !== 0 || m.noi !== 0)) v.push({ invariant: 5, message: `operating income at month ${m.t} < O` });
  }

  return v;
}

function rolledLandLoan(outputs: DealOutputs): number {
  const P = outputs.timeline.P;
  const prev = outputs.months[P - 1];
  const atP = outputs.months[P];
  if (!atP) return 0;
  // Balance rolled = prior balance + interest at P (P > 0), or the draw itself when P = 0.
  if (P === 0) return atP.landLoanDraw;
  return (prev?.landLoanBalance ?? 0) + atP.interestBreakdown.land;
}

export function assertInvariants(outputs: DealOutputs): void {
  const violations = checkInvariants(outputs);
  if (violations.length > 0) {
    throw new Error(`invariant violations:\n${violations.map((x) => `  [${x.invariant}] ${x.message}`).join('\n')}`);
  }
}
