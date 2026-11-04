/**
 * Pure numeric helpers used by the engine. Nothing here rounds: the engine always returns
 * full-precision IEEE doubles (spec 7.1, 7.13).
 */
import { EngineError } from './errors';
import type { Distribution } from './schema';

/** Annual step growth factor: g(r, t) = (1 + r)^floor(t / 12), applied from month 0 (7.1). */
export function growth(annualRate: number, t: number): number {
  return Math.pow(1 + annualRate, Math.floor(t / 12));
}

/** Standard normal density φ(z). */
export function phi(z: number): number {
  return Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI);
}

/**
 * S-curve weights over a window of C months (7.4):
 * w_k = φ((k + 0.5 − C/2) / (C/6)) / Σ_j φ((j + 0.5 − C/2) / (C/6)), k = 0..C−1.
 * C = 1 yields [1].
 */
export function scurveWeights(C: number): number[] {
  if (!Number.isInteger(C) || C < 0) throw new EngineError('bad-window', `invalid window ${C}`);
  if (C === 0) return [];
  if (C === 1) return [1];
  const raw: number[] = [];
  for (let k = 0; k < C; k++) raw.push(phi((k + 0.5 - C / 2) / (C / 6)));
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / total);
}

/** Straight-line weights: w_k = 1 / C. */
export function straightWeights(C: number): number[] {
  if (!Number.isInteger(C) || C < 0) throw new EngineError('bad-window', `invalid window ${C}`);
  if (C === 0) return [];
  return new Array<number>(C).fill(1 / C);
}

/** Custom weights are normalized to sum to 1 and must have length C (7.4). */
export function customWeights(weights: readonly number[], C: number): number[] {
  if (weights.length !== C) {
    throw new EngineError(
      'custom-weights-length',
      `custom distribution has ${weights.length} weights but the window is ${C} months`,
    );
  }
  if (C === 0) return [];
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) throw new EngineError('custom-weights-zero', 'custom weights sum to zero');
  return weights.map((w) => w / total);
}

/** Weights for a distribution kind over a window of C months. */
export function distributionWeights(distribution: Distribution, C: number): number[] {
  switch (distribution.kind) {
    case 'scurve':
      return scurveWeights(C);
    case 'straight':
      return straightWeights(C);
    case 'custom':
      return customWeights(distribution.weights, C);
  }
}

/**
 * Units per type: round(total × share_i) with largest-remainder correction so the counts sum
 * to `total` (7.3). Floors every share, then hands the remaining units to the largest fractional
 * remainders; ties go to the earlier type.
 */
export function largestRemainder(total: number, shares: readonly number[]): number[] {
  if (shares.length === 0) return [];
  const exact = shares.map((s) => total * s);
  const floors = exact.map((x) => Math.floor(x + 1e-9));
  let remaining = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x + 1e-9) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const result = [...floors];
  let idx = 0;
  while (remaining > 0 && order.length > 0) {
    const entry = order[idx % order.length]!;
    result[entry.i] = (result[entry.i] ?? 0) + 1;
    remaining -= 1;
    idx += 1;
  }
  while (remaining < 0) {
    // Shares summing to more than 1 (rejected by validation) would over-allocate; trim from the end.
    const entry = order[order.length - 1 - (idx % order.length)]!;
    if ((result[entry.i] ?? 0) > 0) {
      result[entry.i] = (result[entry.i] ?? 0) - 1;
      remaining += 1;
    }
    idx += 1;
  }
  return result;
}

export function sum(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function sumRange(xs: readonly number[], from: number, toInclusive: number): number {
  let s = 0;
  for (let i = Math.max(0, from); i <= toInclusive && i < xs.length; i++) s += xs[i]!;
  return s;
}

export function zeros(n: number): number[] {
  return new Array<number>(Math.max(0, n)).fill(0);
}

/** Net present value of a monthly series at a monthly rate. */
export function npv(monthlyRate: number, cashflows: readonly number[]): number {
  let total = 0;
  let discount = 1;
  const factor = 1 / (1 + monthlyRate);
  for (let t = 0; t < cashflows.length; t++) {
    total += cashflows[t]! * discount;
    discount *= factor;
  }
  return total;
}

function dnpv(monthlyRate: number, cashflows: readonly number[]): number {
  let total = 0;
  for (let t = 1; t < cashflows.length; t++) {
    total += (-t * cashflows[t]!) / Math.pow(1 + monthlyRate, t + 1);
  }
  return total;
}

/**
 * Monthly IRR of a monthly series, solved by Newton's method with a bisection fallback on
 * [−0.99, 10] (7.11). Returns null when the series has no sign change or no root in the bracket.
 */
export function irrMonthly(cashflows: readonly number[]): number | null {
  let hasPos = false;
  let hasNeg = false;
  for (const cf of cashflows) {
    if (cf > 0) hasPos = true;
    if (cf < 0) hasNeg = true;
  }
  if (!hasPos || !hasNeg) return null;

  const lo0 = -0.99;
  const hi0 = 10;
  const tol = 1e-10;

  // Newton from a modest starting guess.
  let r = 0.005;
  for (let i = 0; i < 100; i++) {
    const f = npv(r, cashflows);
    if (Math.abs(f) < 1e-7) return r;
    const d = dnpv(r, cashflows);
    if (!Number.isFinite(d) || d === 0) break;
    const next = r - f / d;
    if (!Number.isFinite(next) || next <= lo0 || next >= hi0) break;
    if (Math.abs(next - r) < tol) return next;
    r = next;
  }

  // Bisection fallback on the bracket.
  let lo = lo0;
  let hi = hi0;
  let flo = npv(lo, cashflows);
  const fhi = npv(hi, cashflows);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fmid = npv(mid, cashflows);
    if (Math.abs(fmid) < 1e-7 || hi - lo < tol) return mid;
    if (flo * fmid < 0) {
      hi = mid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

/** Annual IRR = (1 + irr_m)^12 − 1, or null. */
export function irrAnnual(cashflows: readonly number[]): number | null {
  const m = irrMonthly(cashflows);
  return m === null ? null : Math.pow(1 + m, 12) - 1;
}

/** Level monthly payment for a principal at a monthly rate over n months. */
export function levelPayment(principal: number, monthlyRate: number, n: number): number {
  if (n <= 0) return 0;
  if (monthlyRate === 0) return principal / n;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
}

/** Present-value annuity factor (1 − (1 + i)^−n) / i; equals n when i = 0. */
export function annuityFactor(monthlyRate: number, n: number): number {
  if (monthlyRate === 0) return n;
  return (1 - Math.pow(1 + monthlyRate, -n)) / monthlyRate;
}

export function approxEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

/** Sum of elaborated child line amounts (FR-2.1): the one place children are added up. */
export function sumChildren(children: ReadonlyArray<{ amount: number }>): number {
  let s = 0;
  for (const c of children) s += c.amount;
  return s;
}
