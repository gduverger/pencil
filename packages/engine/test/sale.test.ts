import { describe, expect, it } from 'vitest';
import { run } from '../src/run';
import { fixtureDeal } from './fixtures';

describe('7.9 sale', () => {
  it('values forward NOI at the exit cap, nets selling costs and the payoff, and distributes at S', () => {
    const out = run(fixtureDeal());
    const noiForward = out.forwardNoi.reduce((a, b) => a + b, 0);
    expect(out.forwardNoi).toHaveLength(12);
    expect(out.sale.noiForward).toBeCloseTo(noiForward, 6);
    expect(out.sale.value).toBeCloseTo(noiForward / 0.055, 6);
    expect(out.sale.sellingCosts).toBeCloseTo(0.03 * out.sale.value, 6);
    expect(out.sale.payoff).toBeCloseTo(out.sale.loanPayoff + out.sale.mezzPayoff, 6);
    expect(out.sale.netToEquity).toBeCloseTo(out.sale.value - out.sale.sellingCosts - out.sale.payoff, 6);
    const mS = out.months[120]!;
    expect(mS.saleProceeds).toBeCloseTo(out.sale.netToEquity, 6);
    expect(mS.phase).toBe('sale');
    expect(mS.cashFlowAfterDebt).toBeCloseTo(mS.noi - mS.debtService.interest - mS.debtService.principal + out.sale.netToEquity, 6);
    expect(mS.distributions.gp + mS.distributions.lp).toBeCloseTo(mS.cashFlowAfterDebt, 6);
    // No flows after the sale month exist: the months array ends at S
    expect(out.months).toHaveLength(121);
  });

  it('a negative net to equity is a flag, not an error', () => {
    const d = fixtureDeal();
    const out = run({ ...d, exit: { ...d.exit, exitCapRatePct: 0.5 } });
    expect(out.sale.netToEquity).toBeLessThan(0);
    expect(out.flags.some((f) => f.code === 'negative-net-to-equity')).toBe(true);
    // The shortfall is a pro rata contribution at S
    const mS = out.months[120]!;
    expect(mS.contributions.gp + mS.contributions.lp).toBeCloseTo(Math.max(0, -mS.cashFlowAfterDebt), 6);
  });

  it('mezzanine repaid at sale is paid off from the proceeds and serviced interest-only after R', () => {
    const d = fixtureDeal();
    const out = run({ ...d, financing: { ...d.financing, mezz: { enabled: true, pctOfCost: 0.1, ratePct: 0.12, feePct: 0.01, repaidAt: 'sale' } } });
    const MB = out.totals.mezz;
    expect(MB).toBeGreaterThan(0);
    expect(out.refinance!.mezzPayoff).toBe(0);
    expect(out.sale.mezzPayoff).toBeCloseTo(MB, 6);
    for (let t = 43; t <= 120; t++) {
      expect(out.months[t]!.mezzBalance).toBeCloseTo(MB, 6);
      // perm interest + mezz interest
      const row = out.amortization[t - 43]!;
      expect(out.months[t]!.debtService.interest).toBeCloseTo(row.interest + (MB * 0.12) / 12, 6);
    }
    const atRefi = run({ ...d, financing: { ...d.financing, mezz: { enabled: true, pctOfCost: 0.1, ratePct: 0.12, feePct: 0.01, repaidAt: 'refi' } } });
    expect(atRefi.refinance!.mezzPayoff).toBeCloseTo(atRefi.totals.mezz, 6);
    expect(atRefi.sale.mezzPayoff).toBe(0);
    expect(atRefi.months[50]!.mezzBalance).toBe(0);
  });
});
