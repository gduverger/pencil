import { describe, expect, it } from 'vitest';
import { amortize, sizePermanentLoan } from '../src/permanent';
import { run } from '../src/run';
import { fixtureDeal } from './fixtures';
import type { DealInputsInput } from '../src/schema';

describe('7.8 amortize', () => {
  it('$1,000,000 at 6% over 30 years has a level payment of $5,995.51 and ends at zero', () => {
    const rows = amortize(1_000_000, 0.06, 30, 0);
    expect(rows).toHaveLength(360);
    expect(rows[0]!.payment).toBeCloseTo(5995.51, 2);
    // first row: interest 1,000,000 × 0.005 = 5,000; principal 995.51
    expect(rows[0]!.interest).toBeCloseTo(5000, 6);
    expect(rows[0]!.principal).toBeCloseTo(995.51, 2);
    expect(rows[0]!.endingBalance).toBeCloseTo(999004.49, 2);
    expect(Math.abs(rows[359]!.endingBalance)).toBeLessThan(0.01);
    // balance roll-forward
    for (let k = 1; k < rows.length; k++) expect(rows[k]!.beginningBalance).toBeCloseTo(rows[k - 1]!.endingBalance, 6);
  });

  it('with 24 IO months the first 24 rows are interest only, then level payments to zero', () => {
    const rows = amortize(1_000_000, 0.06, 30, 24);
    expect(rows).toHaveLength(384);
    for (let k = 0; k < 24; k++) {
      expect(rows[k]!.interestOnly).toBe(true);
      expect(rows[k]!.principal).toBe(0);
      expect(rows[k]!.payment).toBeCloseTo(5000, 6);
      expect(rows[k]!.endingBalance).toBe(1_000_000);
    }
    expect(rows[24]!.interestOnly).toBe(false);
    expect(rows[24]!.payment).toBeCloseTo(5995.51, 2);
    expect(Math.abs(rows[383]!.endingBalance)).toBeLessThan(0.01);
  });

  it('handles a zero rate and a zero principal', () => {
    const rows = amortize(120_000, 0, 10, 0);
    expect(rows[0]!.payment).toBeCloseTo(1000, 6);
    expect(rows[0]!.interest).toBe(0);
    expect(amortize(0, 0.06, 30, 0)).toEqual([]);
  });
});

describe('7.8 permanent loan sizing', () => {
  const p = { refiCapRatePct: 0.055, maxLTV: 0.65, minDSCR: 1.25, ratePct: 0.06, amortYears: 30, feePct: 0.01 };

  it('L_LTV = maxLTV × NOI12 / cap and L_DSCR = NOI12 / (DSCR × 12) × annuity factor', () => {
    // NOI12 = 1,650,000: V = 30,000,000; L_LTV = 19,500,000
    // L_DSCR = 1,650,000 / 15 × (1 − 1.005^−360) / 0.005 = 110,000 × 166.7916 = 18,347,077
    const s = sizePermanentLoan(1_650_000, p);
    expect(s.value).toBeCloseTo(30_000_000, 3);
    expect(s.loanLTV).toBeCloseTo(19_500_000, 3);
    expect(s.loanDSCR).toBeCloseTo(110000 * ((1 - Math.pow(1.005, -360)) / 0.005), 3);
    expect(s.loan).toBeCloseTo(s.loanDSCR, 6);
    expect(s.fee).toBeCloseTo(s.loan * 0.01, 6);
  });

  it('the LTV constraint binds when DSCR is loose, and non-positive NOI sizes to zero', () => {
    const s = sizePermanentLoan(1_650_000, { ...p, minDSCR: 1.0 });
    expect(s.loan).toBeCloseTo(19_500_000, 3);
    expect(sizePermanentLoan(-5, p).loan).toBe(0);
  });

  it('when L_DSCR < L_LTV the first-year DSCR equals minDSCR within 1e-6 on a full run', () => {
    const out = run(fixtureDeal());
    const r = out.refinance!;
    expect(r.loanDSCR).toBeLessThan(r.loanLTV);
    expect(r.loan).toBeCloseTo(r.loanDSCR, 6);
    // NOI(R..R+11) over the first twelve payments (R+1..R+12)
    const noi12 = out.months.slice(42, 54).reduce((s, m) => s + m.noi, 0);
    const ds12 = out.months.slice(43, 55).reduce((s, m) => s + m.debtService.interest + m.debtService.principal, 0);
    expect(noi12 / ds12).toBeCloseTo(1.25, 6);
    expect(out.totals.permanentLoan).toBeCloseTo(r.loan, 6);
    expect(out.metrics.permanentLoan).toBeCloseTo(r.loan, 6);
  });

  it('the reverse case gives maxLTV × value', () => {
    const d = fixtureDeal();
    const out = run({ ...d, financing: { ...d.financing, permanent: { ...d.financing!.permanent, minDSCR: 1.0 } } });
    const r = out.refinance!;
    expect(r.loanLTV).toBeLessThan(r.loanDSCR);
    expect(r.loan).toBeCloseTo(0.65 * r.value, 6);
  });

  it('net proceeds: positive is a distribution at R, negative is a pro rata contribution at R', () => {
    const d = fixtureDeal();
    // A costlier version of the fixture ($350/GSF, $4M land) refinances short.
    const shortfall = run({ ...d, site: { ...d.site, landCost: 4_000_000 }, costs: { ...d.costs, hard: { perGrossSF: 350 } } });
    const r = shortfall.refinance!;
    expect(r.net).toBeLessThan(0);
    const mR = shortfall.months[42]!;
    // The refinance flow at R is the net proceeds plus any surplus lease-up NOI carried to R.
    expect(mR.refinance).toBeCloseTo(r.net + shortfall.totals.surplusDistributed, 6);
    // contributions at R = equity calls at R + shortfall split 10/90 (NOI at R nets against it)
    const flow = mR.noi + mR.refinance;
    expect(mR.cashFlowAfterDebt).toBeCloseTo(flow, 6);
    expect(mR.contributions.gp).toBeCloseTo(mR.equityIn.gp + mR.equityIn.inKind + Math.max(0, -flow) * 0.1, 6);
    expect(mR.contributions.lp).toBeCloseTo(mR.equityIn.lp + Math.max(0, -flow) * 0.9, 6);
    expect(shortfall.flags.some((f) => f.code === 'refinance-shortfall')).toBe(true);

    // The fixture itself refinances with proceeds.
    const proceeds = run(d);
    expect(proceeds.refinance!.net).toBeGreaterThan(0);
    const mR2 = proceeds.months[42]!;
    expect(mR2.distributions.gp + mR2.distributions.lp).toBeCloseTo(mR2.noi + proceeds.refinance!.net + proceeds.totals.surplusDistributed, 6);
    expect(proceeds.flags.some((f) => f.code === 'refinance-shortfall')).toBe(false);
  });

  it('debt service after R follows the amortization schedule and the balance at sale matches it', () => {
    const out = run(fixtureDeal());
    const L = out.refinance!.loan;
    expect(out.amortization).toHaveLength(360);
    expect(out.months[42]!.permBalance).toBeCloseTo(L, 6);
    expect(out.months[42]!.debtService.interest + out.months[42]!.debtService.principal).toBe(0);
    for (let t = 43; t <= 120; t++) {
      const row = out.amortization[t - 43]!;
      expect(out.months[t]!.debtService.interest).toBeCloseTo(row.interest, 6);
      expect(out.months[t]!.debtService.principal).toBeCloseTo(row.principal, 6);
      expect(out.months[t]!.permBalance).toBeCloseTo(row.endingBalance, 6);
      expect(out.months[t]!.loanBalance).toBe(0);
    }
    expect(out.sale.loanPayoff).toBeCloseTo(out.amortization[120 - 43]!.endingBalance, 6);
  });

  it('interest-only months on the permanent loan pay no principal', () => {
    const d = fixtureDeal();
    const out = run({ ...d, financing: { ...d.financing, permanent: { ...d.financing!.permanent, ioMonths: 24 } } });
    for (let t = 43; t < 43 + 24; t++) expect(out.months[t]!.debtService.principal).toBe(0);
    expect(out.months[43 + 24]!.debtService.principal).toBeGreaterThan(0);
  });

  it('with the permanent loan off, the construction loan stays outstanding interest-only until the sale', () => {
    const d = fixtureDeal();
    const out = run({ ...d, financing: { ...d.financing, permanent: { ...d.financing!.permanent, enabled: false } } } as DealInputsInput);
    expect(out.refinance).toBeNull();
    expect(out.amortization).toEqual([]);
    const B = out.totals.constructionLoan;
    expect(out.timeline.R).toBe(42);
    for (let t = 43; t <= 120; t++) {
      expect(out.months[t]!.loanBalance).toBeCloseTo(B, 6);
      expect(out.months[t]!.debtService.interest).toBeCloseTo((B * 0.08) / 12, 6);
      expect(out.months[t]!.debtService.principal).toBe(0);
      expect(out.months[t]!.permBalance).toBe(0);
    }
    expect(out.sale.loanPayoff).toBeCloseTo(B, 6);
    expect(out.totals.permanentLoan).toBe(0);
  });
});
