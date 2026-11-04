import { describe, expect, it } from 'vitest';
import { runWaterfall } from '../src/waterfall';
import { run } from '../src/run';
import { fixtureDeal } from './fixtures';
import type { DealInputsInput } from '../src/schema';

describe('7.10 waterfall with IRR-hurdle balances', () => {
  it('allocates one distribution across three tiers exactly as the hurdle balances dictate', () => {
    // Contributions at t = 0: LP 90, GP 10. One distribution of 120 at t = 12.
    // Tier 1 (8%, 90/10): HB_LP = 90 × 1.08 = 97.2 → capacity 97.2 / 0.9 = 108 → LP 97.2, GP 10.8
    // Tier 2 (15%, 70/30): HB_LP = 90 × 1.15 − 97.2 = 6.3 → capacity 6.3 / 0.7 = 9 → LP 6.3, GP 2.7
    // Tier 3 (residual 50/50): 120 − 108 − 9 = 3 → LP 1.5, GP 1.5
    // Totals: LP 105, GP 15.
    const tiers = [
      { hurdleIrrPct: 0.08, lpSplit: 0.9, gpSplit: 0.1 },
      { hurdleIrrPct: 0.15, lpSplit: 0.7, gpSplit: 0.3 },
      { hurdleIrrPct: null, lpSplit: 0.5, gpSplit: 0.5 },
    ];
    const contributionsGp = [10, ...new Array(12).fill(0)];
    const contributionsLp = [90, ...new Array(12).fill(0)];
    const distributions = [...new Array(12).fill(0), 120];
    const w = runWaterfall({ tiers, contributionsGp, contributionsLp, distributions, saleMonth: 12 });
    const m = w.byMonth[12]!;
    expect(m.byTier[0]).toBeCloseTo(108, 9);
    expect(m.byTier[1]).toBeCloseTo(9, 9);
    expect(m.byTier[2]).toBeCloseTo(3, 9);
    expect(m.lp).toBeCloseTo(105, 9);
    expect(m.gp).toBeCloseTo(15, 9);
    expect(w.tiers[0]!.lpBalanceAtCompletion).toBeCloseTo(0, 9);
    expect(w.tiers[1]!.lpBalanceAtCompletion).toBeCloseTo(0, 9);
    expect(w.tiers[2]!.lpBalanceAtCompletion).toBeNull();
    expect(w.tiers[0]!.atSale.total).toBeCloseTo(108, 9);
  });

  it('a single-tier pro rata structure returns LP IRR = GP IRR = project IRR', () => {
    const d = fixtureDeal();
    const out = run({ ...d, equity: { gpPct: 0.1, lpPct: 0.9, tiers: [{ hurdleIrrPct: null, lpSplit: 0.9, gpSplit: 0.1 }] } });
    expect(out.metrics.projectIrr).not.toBeNull();
    expect(out.metrics.lpIrr).toBeCloseTo(out.metrics.projectIrr!, 8);
    expect(out.metrics.gpIrr).toBeCloseTo(out.metrics.projectIrr!, 8);
    expect(out.waterfall.byPartner.lp.multiple).toBeCloseTo(out.metrics.equityMultiple!, 8);
  });

  it('a two-tier structure with a hurdle below the project IRR gives the GP a higher IRR than the LP', () => {
    const d = fixtureDeal();
    const base = run(d);
    expect(base.metrics.projectIrr).toBeGreaterThan(0.08);
    const out = run({
      ...d,
      equity: { gpPct: 0.1, lpPct: 0.9, tiers: [{ hurdleIrrPct: 0.08, lpSplit: 0.9, gpSplit: 0.1 }, { hurdleIrrPct: null, lpSplit: 0.6, gpSplit: 0.4 }] },
    } as DealInputsInput);
    expect(out.metrics.gpIrr!).toBeGreaterThan(out.metrics.lpIrr!);
    expect(out.metrics.lpIrr!).toBeLessThan(out.metrics.projectIrr!);
    expect(out.metrics.gpIrr!).toBeGreaterThan(out.metrics.projectIrr!);
    // The LP achieved at least its hurdle
    expect(out.metrics.lpIrr!).toBeGreaterThanOrEqual(0.08 - 1e-6);
    expect(out.waterfall.tiers[1]!.total).toBeGreaterThan(0);
  });

  it('tier capacities never pay the LP past its hurdle balance', () => {
    const out = run(fixtureDeal());
    const paidTiers = out.waterfall.tiers.filter((t) => t.total > 0);
    expect(paidTiers.length).toBeGreaterThanOrEqual(2);
    for (let k = 0; k < out.waterfall.tiers.length - 1; k++) {
      const tier = out.waterfall.tiers[k]!;
      const next = out.waterfall.tiers[k + 1]!;
      if (next.total > 0) {
        expect(tier.lpBalanceAtCompletion).not.toBeNull();
        expect(Math.abs(tier.lpBalanceAtCompletion!)).toBeLessThan(0.01);
      }
    }
    // every tier payout is non-negative and partner totals add up
    for (const m of out.months) for (const x of m.distributions.byTier) expect(x).toBeGreaterThanOrEqual(0);
    const lp = out.months.reduce((s, m) => s + m.distributions.lp, 0);
    const gp = out.months.reduce((s, m) => s + m.distributions.gp, 0);
    expect(lp + gp).toBeCloseTo(out.totals.totalDistributions, 6);
    expect(out.waterfall.tiers.reduce((s, t) => s + t.total, 0)).toBeCloseTo(out.totals.totalDistributions, 6);
  });

  it('in-kind land counts as a GP contribution in the waterfall', () => {
    const d = fixtureDeal();
    const out = run({ ...d, site: { ...d.site, landOwned: true } });
    expect(out.months[0]!.contributions.gp).toBeCloseTo(out.months[0]!.equityIn.gp + 3_000_000, 6);
    expect(out.waterfall.byPartner.gp.contributions).toBeGreaterThan(3_000_000);
  });
});
