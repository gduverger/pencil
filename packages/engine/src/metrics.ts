/** Metrics (7.11) on the monthly series. */
import { irrAnnual, sumRange } from './math';
import type { Timeline } from './timeline';
import type { DealOutputs, MetricKey, MonthRow, ProgramSummary, SaleResult, Totals } from './types';
import { METRIC_KEYS } from './types';

export interface MetricSeries {
  unlevered: number[];
  project: number[];
  lp: number[];
  gp: number[];
}

/** The cash-flow series behind each IRR, exposed for `explain`. */
export function metricSeries(months: MonthRow[], sale: SaleResult, tl: Timeline): MetricSeries {
  const unlevered: number[] = [];
  const project: number[] = [];
  const lp: number[] = [];
  const gp: number[] = [];
  for (const m of months) {
    // Capitalized costs excluding loan fees and interest; deficits are already in NOI.
    const capitalized =
      m.costTotal - m.costs.financingFees - m.costs.capitalizedInterest - m.costs.operatingDeficit;
    let u = -capitalized + m.inflows;
    if (m.t >= tl.O) u += m.noi;
    if (m.t === tl.S) u += sale.value - sale.sellingCosts;
    unlevered.push(u);
    project.push(
      -(m.contributions.gp + m.contributions.lp) + m.distributions.gp + m.distributions.lp,
    );
    lp.push(-m.contributions.lp + m.distributions.lp);
    gp.push(-m.contributions.gp + m.distributions.gp);
  }
  return { unlevered, project, lp, gp };
}

export function computeMetrics(
  months: MonthRow[],
  totals: Totals,
  sale: SaleResult,
  tl: Timeline,
  program: ProgramSummary,
  exitCapRatePct: number,
): {
  metrics: Record<MetricKey, number | null>;
  series: MetricSeries;
  byPartner: DealOutputs['waterfall']['byPartner'];
} {
  const series = metricSeries(months, sale, tl);
  const metrics = {} as Record<MetricKey, number | null>;
  for (const k of METRIC_KEYS) metrics[k] = null;

  const contribGp = months.reduce((s, m) => s + m.contributions.gp, 0);
  const contribLp = months.reduce((s, m) => s + m.contributions.lp, 0);
  const distGp = months.reduce((s, m) => s + m.distributions.gp, 0);
  const distLp = months.reduce((s, m) => s + m.distributions.lp, 0);
  const contrib = contribGp + contribLp;
  const dist = distGp + distLp;

  metrics.unleveredIrr = irrAnnual(series.unlevered);
  metrics.projectIrr = irrAnnual(series.project);
  metrics.lpIrr = irrAnnual(series.lp);
  metrics.gpIrr = irrAnnual(series.gp);
  metrics.equityMultiple = contrib > 0 ? dist / contrib : null;
  metrics.lpMultiple = contribLp > 0 ? distLp / contribLp : null;
  metrics.gpMultiple = contribGp > 0 ? distGp / contribGp : null;

  const noiStabilized = sumRange(
    months.map((m) => m.noi),
    tl.Z,
    tl.Z + 11,
  );
  metrics.stabilizedNoi = noiStabilized;
  metrics.yieldOnCost = totals.tpc > 0 ? noiStabilized / totals.tpc : null;
  metrics.developmentSpread =
    metrics.yieldOnCost === null ? null : metrics.yieldOnCost - exitCapRatePct;

  let cumulative = 0;
  let peak = 0;
  for (const m of months) {
    cumulative += m.contributions.gp + m.contributions.lp - m.distributions.gp - m.distributions.lp;
    if (cumulative > peak) peak = cumulative;
  }
  metrics.peakEquity = peak;
  metrics.profit = dist - contrib;
  metrics.totalProjectCost = totals.tpc;
  metrics.costPerUnit = program.totalUnits > 0 ? totals.tpc / program.totalUnits : null;
  metrics.costPerGSF = program.gsfTotal > 0 ? totals.tpc / program.gsfTotal : null;
  metrics.totalEquity = contrib;
  metrics.saleValue = sale.value;
  metrics.netToEquityAtSale = sale.netToEquity;
  metrics.permanentLoan = totals.permanentLoan;
  metrics.constructionLoan = totals.constructionLoan;
  metrics.capitalizedInterest = totals.capitalizedInterest;

  const byPartner = {
    gp: {
      contributions: contribGp,
      distributions: distGp,
      irr: metrics.gpIrr,
      multiple: metrics.gpMultiple,
      profit: distGp - contribGp,
    },
    lp: {
      contributions: contribLp,
      distributions: distLp,
      irr: metrics.lpIrr,
      multiple: metrics.lpMultiple,
      profit: distLp - contribLp,
    },
  };
  return { metrics, series, byPartner };
}
