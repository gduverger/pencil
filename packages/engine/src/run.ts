/** `run(inputs)`: the pure function from DealInputs to DealOutputs (7.14). */
import { buildCapitalBudget, buildSourcesUses, buildTotals } from './assemble';
import { buildCostSchedule } from './costs';
import { EngineError } from './errors';
import { solveFunding } from './funding';
import { computeOperations } from './operations';
import { computeProgram } from './program';
import { parseInputs, type DealInputs } from './schema';
import { buildTimeline, phaseAt, timelineSummary } from './timeline';
import type { DealOutputs, Flag, MetricKey, MonthRow, OpexLine } from './types';
import { METRIC_KEYS, OPEX_LINES } from './types';
import { hasErrors, validateParsed } from './validate';
import { ENGINE_VERSION } from './version';

export function run(raw: unknown): DealOutputs {
  const inputs: DealInputs = parseInputs(raw);
  const issues = validateParsed(inputs);
  if (hasErrors(issues)) {
    throw new EngineError('invalid-inputs', issues.filter((i) => i.level === 'error').map((i) => i.message).join('; '), issues);
  }
  const flags: Flag[] = issues.map((i) => ({ code: i.code, message: i.message, ...(i.path ? { path: i.path } : {}) }));

  const tl = buildTimeline(inputs);
  const program = computeProgram(inputs);
  const cost = buildCostSchedule(inputs, program, tl);
  const ops = computeOperations(inputs, program, tl);
  const funding = solveFunding(inputs, tl, cost, ops.noi);

  const n = tl.S + 1;
  const months: MonthRow[] = [];
  for (let t = 0; t < n; t++) {
    const f = funding.months[t]!;
    const opex = {} as Record<OpexLine, number>;
    for (const l of OPEX_LINES) opex[l] = ops.opex[l][t] ?? 0;
    months.push({
      t,
      phase: phaseAt(tl, t),
      costs: f.costs,
      costTotal: f.costTotal,
      inflows: f.inflows,
      equityIn: { gp: f.equityCashGp, lp: f.equityCashLp, inKind: f.equityInKind },
      contributions: {
        gp: f.equityCashGp + f.equityInKind + f.deficitContributionGp,
        lp: f.equityCashLp + f.deficitContributionLp,
      },
      mezzDraw: f.mezzDraw,
      loanDraw: f.loanDraw,
      landLoanDraw: f.landLoanDraw,
      interest: f.interestConstruction + f.interestLand + f.interestMezz,
      interestBreakdown: { construction: f.interestConstruction, land: f.interestLand, mezz: f.interestMezz },
      loanBalance: f.loanBalance,
      landLoanBalance: f.landLoanBalance,
      mezzBalance: f.mezzBalance,
      gpr: ops.gpr[t] ?? 0,
      occupancy: ops.occupancy[t] ?? 0,
      vacancyAndCreditLoss: ops.vacancyAndCreditLoss[t] ?? 0,
      otherIncome: ops.otherIncome[t] ?? 0,
      commercialIncome: ops.commercialIncome[t] ?? 0,
      egi: ops.egi[t] ?? 0,
      opex,
      opexTotal: ops.opexTotal[t] ?? 0,
      noi: ops.noi[t] ?? 0,
      debtService: { interest: 0, principal: 0 },
      permBalance: 0,
      refinance: 0,
      saleProceeds: 0,
      cashFlowAfterDebt: 0,
      distributions: { gp: 0, lp: 0, byTier: inputs.equity.tiers.map(() => 0) },
    });
  }

  const totalContributions = months.reduce((s, m) => s + m.contributions.gp + m.contributions.lp, 0);
  const totals = buildTotals(funding, 0, 0, totalContributions, 0);
  const sourcesUses = buildSourcesUses(inputs, cost, funding, totals, program, 0);
  const capitalBudget = buildCapitalBudget(inputs, cost, funding, totals, program);

  const metrics = {} as Record<MetricKey, number | null>;
  for (const k of METRIC_KEYS) metrics[k] = null;
  metrics.totalProjectCost = totals.tpc;
  metrics.costPerUnit = program.totalUnits > 0 ? totals.tpc / program.totalUnits : null;
  metrics.costPerGSF = program.gsfTotal > 0 ? totals.tpc / program.gsfTotal : null;
  metrics.totalEquity = totals.equity;
  metrics.constructionLoan = totals.constructionLoan;
  metrics.capitalizedInterest = totals.capitalizedInterest;

  return {
    inputs,
    program,
    timeline: timelineSummary(tl, inputs.meta.analysisMonth),
    months,
    forwardNoi: ops.noi.slice(tl.S + 1, tl.S + 13),
    annual: [],
    totals,
    sourcesUses,
    capitalBudget,
    refinance: null,
    sale: { month: tl.S, noiForward: 0, capRate: inputs.exit.exitCapRatePct, value: 0, sellingCosts: 0, loanPayoff: 0, mezzPayoff: 0, payoff: 0, netToEquity: 0 },
    amortization: [],
    waterfall: {
      tiers: [],
      byPartner: {
        gp: { contributions: months.reduce((s, m) => s + m.contributions.gp, 0), distributions: 0, irr: null, multiple: null, profit: 0 },
        lp: { contributions: months.reduce((s, m) => s + m.contributions.lp, 0), distributions: 0, irr: null, multiple: null, profit: 0 },
      },
    },
    metrics,
    flags,
    diagnostics: { iterations: funding.iterations, engineVersion: ENGINE_VERSION },
  };
}
