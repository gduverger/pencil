import { describe, expect, it } from 'vitest';
import { run } from '../src/run';
import { irrAnnual } from '../src/math';
import { metricSeries } from '../src/metrics';
import { buildTimeline } from '../src/timeline';
import { fixtureDeal, fixtureInputs } from './fixtures';

describe('7.11 metrics', () => {
  const out = run(fixtureDeal());
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  it('unlevered IRR uses costs excluding fees, interest and deficits, NOI from O, and the net sale value', () => {
    const tl = buildTimeline(fixtureInputs());
    const series = metricSeries(out.months, out.sale, tl);
    const m0 = out.months[0]!;
    expect(series.unlevered[0]).toBeCloseTo(-(m0.costTotal - m0.costs.financingFees - m0.costs.capitalizedInterest - m0.costs.operatingDeficit), 6);
    const m50 = out.months[50]!;
    expect(series.unlevered[50]).toBeCloseTo(m50.noi, 6);
    const mS = out.months[120]!;
    expect(series.unlevered[120]).toBeCloseTo(mS.noi + out.sale.value - out.sale.sellingCosts, 6);
    expect(out.metrics.unleveredIrr).toBeCloseTo(irrAnnual(series.unlevered)!, 10);
  });

  it('project, LP and GP IRRs come from contributions and distributions', () => {
    const project = out.months.map((m) => -(m.contributions.gp + m.contributions.lp) + m.distributions.gp + m.distributions.lp);
    expect(out.metrics.projectIrr).toBeCloseTo(irrAnnual(project)!, 10);
    const lp = out.months.map((m) => -m.contributions.lp + m.distributions.lp);
    expect(out.metrics.lpIrr).toBeCloseTo(irrAnnual(lp)!, 10);
    expect(out.waterfall.byPartner.lp.irr).toBe(out.metrics.lpIrr);
  });

  it('equity multiple, profit, peak equity, yield on cost and spread', () => {
    const contrib = out.totals.totalContributions;
    const dist = out.totals.totalDistributions;
    expect(out.metrics.equityMultiple).toBeCloseTo(dist / contrib, 10);
    expect(out.metrics.profit).toBeCloseTo(dist - contrib, 6);
    let cumulative = 0;
    let peak = 0;
    for (const m of out.months) {
      cumulative += m.contributions.gp + m.contributions.lp - m.distributions.gp - m.distributions.lp;
      peak = Math.max(peak, cumulative);
    }
    expect(out.metrics.peakEquity).toBeCloseTo(peak, 6);
    const noiZ = sum(out.months.slice(42, 54).map((m) => m.noi));
    expect(out.metrics.stabilizedNoi).toBeCloseTo(noiZ, 6);
    expect(out.metrics.yieldOnCost).toBeCloseTo(noiZ / out.totals.tpc, 10);
    expect(out.metrics.developmentSpread).toBeCloseTo(noiZ / out.totals.tpc - 0.055, 10);
    expect(out.metrics.yieldOnCost!).toBeGreaterThan(0.055);
  });

  it('cost per unit and per GSF', () => {
    expect(out.metrics.costPerUnit).toBeCloseTo(out.totals.tpc / 60, 6);
    expect(out.metrics.costPerGSF).toBeCloseTo(out.totals.tpc / out.program.gsfTotal, 6);
  });

  it('annual rows: twelve-month periods from month 0, DSCR and cash-on-cash by year', () => {
    expect(out.annual).toHaveLength(11);
    expect(out.annual[0]).toMatchObject({ year: 1, fromMonth: 0, toMonth: 11, partial: false });
    expect(out.annual[10]).toMatchObject({ year: 11, fromMonth: 120, toMonth: 120, partial: true });
    const y5 = out.annual[4]!; // months 48–59, full permanent debt service
    const noi = sum(out.months.slice(48, 60).map((m) => m.noi));
    const ds = sum(out.months.slice(48, 60).map((m) => m.debtService.interest + m.debtService.principal));
    expect(y5.noi).toBeCloseTo(noi, 6);
    expect(y5.debtService.total).toBeCloseTo(ds, 6);
    expect(y5.dscr).toBeCloseTo(noi / ds, 10);
    const cumulativeContrib = sum(out.months.slice(0, 60).map((m) => m.contributions.gp + m.contributions.lp));
    expect(y5.cashOnCash).toBeCloseTo((noi - ds) / cumulativeContrib, 10);
    expect(out.annual[0]!.dscr).toBeNull();
    expect(out.annual[0]!.cashOnCash).toBeNull();
    expect(sum(out.annual.map((a) => a.noi))).toBeCloseTo(sum(out.months.map((m) => m.noi)), 6);
  });

  it('IRR is null and flagged when the series has no root in the bracket', () => {
    const d = fixtureDeal();
    // An exit cap of 50% wipes out the sale: the series starts and ends with contributions, so the
    // solver finds no sign change on [−0.99, 10] and the IRR is undefined rather than invented.
    const bad = run({ ...d, exit: { ...d.exit, exitCapRatePct: 0.5 } });
    expect(bad.metrics.projectIrr).toBeNull();
    expect(bad.flags.some((f) => f.code === 'irr-undefined')).toBe(true);
    expect(bad.metrics.equityMultiple!).toBeLessThan(1);
  });
});
