/** `run(inputs)`: the pure function from DealInputs to DealOutputs (7.14). */
import { buildAnnual } from './annual';
import { buildCapitalBudget, buildSourcesUses, buildTotals } from './assemble';
import { computeCapital } from './capital';
import { buildCostSchedule } from './costs';
import { EngineError } from './errors';
import { solveFunding } from './funding';
import { computeMetrics } from './metrics';
import { computeOperations } from './operations';
import { computeProgram } from './program';
import { parseInputs, type DealInputs } from './schema';
import { buildTimeline, phaseAt, timelineSummary } from './timeline';
import type { DealOutputs, Flag, MonthRow, OpexLine } from './types';
import { OPEX_LINES } from './types';
import { hasErrors, validateParsed } from './validate';
import { ENGINE_VERSION } from './version';
import { runWaterfall } from './waterfall';

export function run(raw: unknown): DealOutputs {
  const inputs: DealInputs = parseInputs(raw);
  const issues = validateParsed(inputs);
  if (hasErrors(issues)) {
    throw new EngineError(
      'invalid-inputs',
      issues
        .filter((i) => i.level === 'error')
        .map((i) => i.message)
        .join('; '),
      issues,
    );
  }
  const flags: Flag[] = issues.map((i) => ({
    code: i.code,
    message: i.message,
    ...(i.path ? { path: i.path } : {}),
  }));

  const tl = buildTimeline(inputs);
  const program = computeProgram(inputs);
  const cost = buildCostSchedule(inputs, program, tl);
  const ops = computeOperations(inputs, program, tl);
  const funding = solveFunding(inputs, tl, cost, ops.noi);
  const capital = computeCapital(inputs, tl, ops, funding);

  // Contributions: development-period equity (cash pro rata, in-kind GP), non-capitalized deficits,
  // and every negative post-development flow (refinance shortfall, post-refinance deficits) pro rata.
  const n = tl.S + 1;
  const gpPct = inputs.equity.gpPct;
  const lpPct = inputs.equity.lpPct;
  const contributionsGp: number[] = [];
  const contributionsLp: number[] = [];
  const distributionsPre: number[] = [];
  for (let t = 0; t < n; t++) {
    const f = funding.months[t]!;
    const flow = capital.flow[t]!;
    const shortfall = flow < 0 ? -flow : 0;
    contributionsGp.push(
      f.equityCashGp + f.equityInKind + f.deficitContributionGp + shortfall * gpPct,
    );
    contributionsLp.push(f.equityCashLp + f.deficitContributionLp + shortfall * lpPct);
    distributionsPre.push(flow > 0 ? flow : 0);
  }
  const waterfall = runWaterfall({
    tiers: inputs.equity.tiers,
    contributionsGp,
    contributionsLp,
    distributions: distributionsPre,
    saleMonth: tl.S,
  });

  const months: MonthRow[] = [];
  for (let t = 0; t < n; t++) {
    const f = funding.months[t]!;
    const w = waterfall.byMonth[t]!;
    const opex = {} as Record<OpexLine, number>;
    for (const l of OPEX_LINES) opex[l] = ops.opex[l][t] ?? 0;
    months.push({
      t,
      phase: phaseAt(tl, t),
      costs: f.costs,
      costTotal: f.costTotal,
      inflows: f.inflows,
      equityIn: { gp: f.equityCashGp, lp: f.equityCashLp, inKind: f.equityInKind },
      contributions: { gp: contributionsGp[t]!, lp: contributionsLp[t]! },
      deficitContribution: f.deficitContributionGp + f.deficitContributionLp,
      mezzDraw: f.mezzDraw,
      loanDraw: f.loanDraw,
      landLoanDraw: f.landLoanDraw,
      interest: f.interestConstruction + f.interestLand + f.interestMezz,
      interestBreakdown: {
        construction: f.interestConstruction,
        land: f.interestLand,
        mezz: f.interestMezz,
      },
      loanBalance: capital.loanBalance[t]!,
      landLoanBalance: f.landLoanBalance,
      mezzBalance: capital.mezzBalance[t]!,
      gpr: ops.gpr[t] ?? 0,
      occupancy: ops.occupancy[t] ?? 0,
      vacancyAndCreditLoss: ops.vacancyAndCreditLoss[t] ?? 0,
      otherIncome: ops.otherIncome[t] ?? 0,
      commercialIncome: ops.commercialIncome[t] ?? 0,
      egi: ops.egi[t] ?? 0,
      opex,
      opexTotal: ops.opexTotal[t] ?? 0,
      noi: ops.noi[t] ?? 0,
      debtService: {
        interest: capital.debtServiceInterest[t]!,
        principal: capital.debtServicePrincipal[t]!,
      },
      permBalance: capital.permBalance[t]!,
      refinance: capital.refinanceFlow[t]!,
      saleProceeds: capital.saleFlow[t]!,
      cashFlowAfterDebt: capital.flow[t]!,
      distributions: { gp: w.gp, lp: w.lp, byTier: w.byTier },
    });
  }

  const totalContributions =
    contributionsGp.reduce((a, b) => a + b, 0) + contributionsLp.reduce((a, b) => a + b, 0);
  const totalDistributions = distributionsPre.reduce((a, b) => a + b, 0);
  const totals = buildTotals(
    funding,
    capital.permanentLoan,
    totalContributions,
    totalDistributions,
  );
  const sourcesUses = buildSourcesUses(
    inputs,
    cost,
    funding,
    totals,
    program,
    capital.permanentLoan,
  );
  const capitalBudget = buildCapitalBudget(inputs, cost, funding, totals, program);
  const annual = buildAnnual(months);
  const { metrics, byPartner } = computeMetrics(
    months,
    totals,
    capital.sale,
    tl,
    program,
    inputs.exit.exitCapRatePct,
  );

  if (funding.oscillation) {
    flags.push({
      code: 'fixed-point-oscillation',
      message: `total project cost settled to within ${Math.round(funding.residual).toLocaleString('en-US')} dollars between two funding schedules that differ by the month of the first mezzanine draw; the closer schedule is shown`,
    });
  }
  // Post-run flags (7.9: a negative net to equity is a flag, not an error).
  if (capital.sale.netToEquity < 0) {
    flags.push({
      code: 'negative-net-to-equity',
      message: `sale proceeds do not cover the debt payoff and selling costs (net ${Math.round(capital.sale.netToEquity).toLocaleString('en-US')})`,
    });
  }
  if (capital.refinance && capital.refinance.net < 0) {
    flags.push({
      code: 'refinance-shortfall',
      path: 'financing.permanent',
      message: `the permanent loan does not repay the construction loan at month ${tl.R}; equity contributes ${Math.round(-capital.refinance.net).toLocaleString('en-US')}`,
    });
  }
  if (capital.refinance && capital.refinance.loan === 0) {
    flags.push({
      code: 'no-permanent-loan',
      path: 'financing.permanent',
      message:
        'forward NOI at the refinance month is not positive, so the permanent loan sizes to zero',
    });
  }
  for (const [k, v] of Object.entries(metrics)) {
    if ((k === 'projectIrr' || k === 'unleveredIrr') && v === null) {
      flags.push({
        code: 'irr-undefined',
        message: `${k === 'projectIrr' ? 'project' : 'unlevered'} IRR is undefined: the cash-flow series has no sign change or no root`,
      });
    }
  }

  return {
    inputs,
    program,
    timeline: timelineSummary(tl, inputs.meta.analysisMonth),
    months,
    forwardNoi: ops.noi.slice(tl.S + 1, tl.S + 13),
    annual,
    totals,
    sourcesUses,
    capitalBudget,
    refinance: capital.refinance,
    sale: capital.sale,
    amortization: capital.amortization,
    waterfall: {
      tiers: waterfall.tiers,
      byPartner,
    },
    metrics,
    flags,
    diagnostics: {
      iterations: funding.iterations,
      engineVersion: ENGINE_VERSION,
      residual: funding.residual,
      convergence: funding.oscillation ? 'oscillation' : 'exact',
    },
  };
}
