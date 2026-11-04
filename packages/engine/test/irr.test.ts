import { describe, expect, it } from 'vitest';
import { annuityFactor, irrAnnual, irrMonthly, npv, sum, sumRange } from '../src/math';

describe('7.11 IRR solver', () => {
  it('−100 then +110 after 12 months returns 10% annual', () => {
    // NPV = −100 + 110 / (1 + r_m)^12 = 0 → (1 + r_m)^12 = 1.1 → annual IRR = 10%
    const series = [-100, ...new Array(11).fill(0), 110];
    expect(irrAnnual(series)).toBeCloseTo(0.1, 8);
    expect(irrMonthly(series)).toBeCloseTo(Math.pow(1.1, 1 / 12) - 1, 10);
  });

  it('a series with no sign change returns null', () => {
    expect(irrAnnual([-100, -5, -5])).toBeNull();
    expect(irrAnnual([100, 5, 5])).toBeNull();
    expect(irrAnnual([0, 0])).toBeNull();
  });

  it('handles a loss (negative IRR) through the bisection bracket', () => {
    // −100 then +80 after 12 months → (1 + r)^12 = 0.8 → −20% annual
    const series = [-100, ...new Array(11).fill(0), 80];
    expect(irrAnnual(series)).toBeCloseTo(-0.2, 8);
  });

  it('handles a very large return (Newton leaves the bracket, bisection recovers)', () => {
    // −1 then +1000 after one month: r_m = 999 → outside Newton's comfort zone but inside [−0.99, 10]? No:
    // monthly 999 is beyond the bracket, so the solver returns null rather than a wrong number.
    expect(irrMonthly([-1, 1000])).toBeNull();
    // −1 then +5 after one month: r_m = 4 (within the bracket)
    expect(irrMonthly([-1, 5])).toBeCloseTo(4, 8);
  });

  it('npv at the IRR is zero', () => {
    const series = [-1000, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 50];
    const r = irrMonthly(series)!;
    expect(Math.abs(npv(r, series))).toBeLessThan(1e-6);
  });

  it('annuity factor matches (1 − (1 + i)^−n) / i and n when i = 0', () => {
    expect(annuityFactor(0.005, 360)).toBeCloseTo((1 - Math.pow(1.005, -360)) / 0.005, 12);
    expect(annuityFactor(0, 360)).toBe(360);
  });

  it('sum helpers', () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sumRange([1, 2, 3, 4], 1, 2)).toBe(5);
    expect(sumRange([1, 2, 3, 4], -5, 100)).toBe(10);
  });
});
