import { describe, expect, it } from 'vitest';
import {
  growth,
  largestRemainder,
  scurveWeights,
  straightWeights,
  customWeights,
  levelPayment,
  sumChildren,
} from '../src/math';
import { EngineError } from '../src/errors';

describe('7.1 growth', () => {
  it('steps annually from month 0: g(r, t) = (1 + r)^floor(t / 12)', () => {
    // 3%: months 0–11 → 1.0; months 12–23 → 1.03; month 24 → 1.0609
    expect(growth(0.03, 0)).toBe(1);
    expect(growth(0.03, 11)).toBe(1);
    expect(growth(0.03, 12)).toBeCloseTo(1.03, 12);
    expect(growth(0.03, 23)).toBeCloseTo(1.03, 12);
    expect(growth(0.03, 24)).toBeCloseTo(1.0609, 12);
    expect(growth(0, 100)).toBe(1);
  });
});

describe('7.3 largest-remainder unit rounding', () => {
  it('sums to totalUnits for mixes that do not divide evenly', () => {
    // 50 units at 0.33/0.33/0.34: exact 16.5/16.5/17 → floors 16/16/17 = 49, one left over.
    // Remainders 0.5/0.5/0 → the first type (tie goes to the earlier one) gets it: 17/16/17.
    expect(largestRemainder(50, [0.33, 0.33, 0.34])).toEqual([17, 16, 17]);
    // 7 units at 0.1/0.4/0.4/0.1: exact 0.7/2.8/2.8/0.7 → floors 0/2/2/0 = 4, three left over.
    // Remainders 0.7/0.8/0.8/0.7 → types 2,3 (0.8) then type 1 (0.7, earlier than type 4): 1/3/3/0.
    expect(largestRemainder(7, [0.1, 0.4, 0.4, 0.1])).toEqual([1, 3, 3, 0]);
    for (const total of [20, 33, 61, 100, 299]) {
      const units = largestRemainder(total, [0.15, 0.35, 0.35, 0.15]);
      expect(units.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  it('is exact when the mix divides evenly', () => {
    // 60 units at 0.1/0.4/0.4/0.1 → 6/24/24/6
    expect(largestRemainder(60, [0.1, 0.4, 0.4, 0.1])).toEqual([6, 24, 24, 6]);
  });
});

describe('7.4 S-curve weights', () => {
  it('has length C, sums to 1 within 1e-12, is symmetric and peaks at the middle', () => {
    for (const C of [2, 3, 12, 18, 24, 31]) {
      const w = scurveWeights(C);
      expect(w).toHaveLength(C);
      expect(Math.abs(w.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-12);
      for (let k = 0; k < C; k++) expect(w[k]).toBeCloseTo(w[C - 1 - k]!, 12);
      const max = Math.max(...w);
      const peakIdx = w.indexOf(max);
      expect(Math.abs(peakIdx - (C - 1) / 2)).toBeLessThanOrEqual(0.5);
      // Monotone up to the peak and down after it.
      for (let k = 1; k <= Math.floor((C - 1) / 2); k++)
        expect(w[k]!).toBeGreaterThanOrEqual(w[k - 1]!);
    }
  });
  it('C = 1 yields [1] and C = 0 yields []', () => {
    expect(scurveWeights(1)).toEqual([1]);
    expect(scurveWeights(0)).toEqual([]);
  });
  it('matches the formula for C = 2: both weights φ(±1.5)/(2φ(1.5)) = 0.5', () => {
    // k=0: (0.5 − 1)/(2/6) = −1.5; k=1: (1.5 − 1)/(1/3) = 1.5; φ is even so each weight is 1/2.
    expect(scurveWeights(2)).toEqual([0.5, 0.5]);
  });
});

describe('7.4 straight-line and custom weights', () => {
  it('straight-line is 1 / C', () => {
    expect(straightWeights(4)).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
  it('custom weights are normalized and must have length C', () => {
    expect(customWeights([1, 3], 2)).toEqual([0.25, 0.75]);
    expect(() => customWeights([1, 2, 3], 2)).toThrow(EngineError);
    expect(() => customWeights([0, 0], 2)).toThrow(EngineError);
  });
});

describe('level payment', () => {
  it('$1,000,000 at 6% over 30 years pays $5,995.51 per month', () => {
    // 1,000,000 × 0.005 / (1 − 1.005^−360) = 5,995.505...
    expect(levelPayment(1_000_000, 0.06 / 12, 360)).toBeCloseTo(5995.51, 2);
  });
});

describe('FR-2.1 sumChildren', () => {
  it('adds child amounts', () => {
    expect(sumChildren([{ amount: 1.5 }, { amount: 2.5 }])).toBe(4);
    expect(sumChildren([])).toBe(0);
  });
});
