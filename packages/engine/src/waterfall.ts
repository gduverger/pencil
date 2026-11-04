/**
 * Tiered waterfall with IRR-hurdle balances (7.10).
 *
 * For every partner p and tier k with hurdle h_k the balance HB[p][k] is updated monthly:
 * HB ← HB × (1 + h_k)^(1/12) + contributions − distributions (every distribution to p, from any
 * tier, reduces every balance of p). In tier k the month's distribution is paid at the tier's splits
 * until the LP's balance reaches zero: capacity = HB[LP][k] / lpSplit_k. The last tier (null
 * hurdle) takes the residual at its splits.
 */
import type { Tier } from './schema';
import type { TierResult } from './types';

export interface WaterfallInput {
  tiers: Tier[];
  contributionsGp: readonly number[];
  contributionsLp: readonly number[];
  /** Pre-waterfall distribution per month (non-negative). */
  distributions: readonly number[];
  saleMonth: number;
}

export interface WaterfallMonth {
  gp: number;
  lp: number;
  byTier: number[];
}

export interface WaterfallResult {
  byMonth: WaterfallMonth[];
  tiers: TierResult[];
  /** LP hurdle balances at the end of the series, per tier. */
  lpBalances: number[];
  gpBalances: number[];
  /** Per tier: HB[LP][k] right after tier k's payment in the first month a later tier was paid, or null. */
  lpBalanceAtCompletion: Array<number | null>;
}

export function runWaterfall(input: WaterfallInput): WaterfallResult {
  const { tiers } = input;
  const K = tiers.length;
  const n = input.distributions.length;
  const hbLp = new Array<number>(K).fill(0);
  const hbGp = new Array<number>(K).fill(0);
  const monthlyFactor = tiers.map((t) =>
    t.hurdleIrrPct === null ? 1 : Math.pow(1 + t.hurdleIrrPct, 1 / 12),
  );
  const tierTotals = tiers.map(() => ({
    total: 0,
    lp: 0,
    gp: 0,
    atSale: { total: 0, lp: 0, gp: 0 },
  }));
  const lpBalanceAtCompletion: Array<number | null> = tiers.map(() => null);
  const byMonth: WaterfallMonth[] = [];

  for (let t = 0; t < n; t++) {
    const cGp = input.contributionsGp[t] ?? 0;
    const cLp = input.contributionsLp[t] ?? 0;
    for (let k = 0; k < K; k++) {
      if (t > 0) {
        hbLp[k] = hbLp[k]! * monthlyFactor[k]!;
        hbGp[k] = hbGp[k]! * monthlyFactor[k]!;
      }
      hbLp[k] = hbLp[k]! + cLp;
      hbGp[k] = hbGp[k]! + cGp;
    }

    let remaining = input.distributions[t] ?? 0;
    const byTier = new Array<number>(K).fill(0);
    let gp = 0;
    let lp = 0;
    for (let k = 0; k < K && remaining > 0; k++) {
      const tier = tiers[k]!;
      const last = k === K - 1;
      let x: number;
      if (last) {
        x = remaining;
      } else {
        const capacity = Math.max(0, hbLp[k]!) / tier.lpSplit;
        x = Math.min(remaining, capacity);
      }
      if (x <= 0) continue;
      const payLp = x * tier.lpSplit;
      const payGp = x * tier.gpSplit;
      byTier[k] = x;
      lp += payLp;
      gp += payGp;
      remaining -= x;
      // Every distribution reduces every balance of the partner, before the next tier's capacity.
      for (let j = 0; j < K; j++) {
        hbLp[j] = hbLp[j]! - payLp;
        hbGp[j] = hbGp[j]! - payGp;
      }
      if (k > 0 && lpBalanceAtCompletion[k - 1] === null) {
        // A later tier is being paid for the first time, so the previous tier must be complete:
        // record HB[LP][k−1] as it stood after tier k−1's own payment (add back this tier's).
        lpBalanceAtCompletion[k - 1] = hbLp[k - 1]! + payLp;
      }
      tierTotals[k]!.total += x;
      tierTotals[k]!.lp += payLp;
      tierTotals[k]!.gp += payGp;
      if (t === input.saleMonth) {
        tierTotals[k]!.atSale.total += x;
        tierTotals[k]!.atSale.lp += payLp;
        tierTotals[k]!.atSale.gp += payGp;
      }
    }
    byMonth.push({ gp, lp, byTier });
  }

  const tierResults: TierResult[] = tiers.map((tier, k) => ({
    index: k,
    hurdleIrrPct: tier.hurdleIrrPct,
    lpSplit: tier.lpSplit,
    gpSplit: tier.gpSplit,
    total: tierTotals[k]!.total,
    lp: tierTotals[k]!.lp,
    gp: tierTotals[k]!.gp,
    atSale: tierTotals[k]!.atSale,
    lpBalanceAtCompletion: lpBalanceAtCompletion[k] ?? null,
  }));
  return { byMonth, tiers: tierResults, lpBalances: hbLp, gpBalances: hbGp, lpBalanceAtCompletion };
}
