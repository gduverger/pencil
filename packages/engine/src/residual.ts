/**
 * Residual land value (7.12): the land cost at which yield on cost equals a target, found by
 * bisection with a full engine run at each step (interest and loan size move with land).
 */
import { run } from './run';
import { parseInputs } from './schema';

export interface ResidualLandValue {
  landCost: number;
  perUnit: number;
  perLotSF: number | null;
  targetYieldOnCost: number;
  achievedYieldOnCost: number | null;
  iterations: number;
  bracket: { lo: number; hi: number };
  /** True when the answer sits on a bracket bound (no land value in range hits the target). */
  atBound: 'low' | 'high' | null;
}

export function residualLandValue(inputs: unknown, targetYieldOnCost?: number): ResidualLandValue {
  const base = parseInputs(inputs);
  const target = targetYieldOnCost ?? base.exit.exitCapRatePct + 0.015;
  const yoc = (landCost: number): number | null =>
    run({ ...base, site: { ...base.site, landCost } }).metrics.yieldOnCost;
  const baseline = run(base);
  const lo0 = 0;
  const hi0 = base.site.landCost > 0 ? 5 * base.site.landCost : baseline.totals.tpc;
  const result = (
    landCost: number,
    iterations: number,
    atBound: ResidualLandValue['atBound'],
  ): ResidualLandValue => ({
    landCost,
    perUnit: base.program.totalUnits > 0 ? landCost / base.program.totalUnits : 0,
    perLotSF: base.site.lotSF > 0 ? landCost / base.site.lotSF : null,
    targetYieldOnCost: target,
    achievedYieldOnCost: yoc(landCost),
    iterations,
    bracket: { lo: lo0, hi: hi0 },
    atBound,
  });

  // Yield on cost falls as land rises. If even free land misses the target, the answer is 0; if the
  // top of the bracket still beats the target, the answer is the bound.
  const yLo = yoc(lo0);
  if (yLo === null || yLo < target) return result(lo0, 0, 'low');
  const yHi = yoc(hi0);
  if (yHi !== null && yHi >= target) return result(hi0, 0, 'high');

  let lo = lo0;
  let hi = hi0;
  let iterations = 0;
  while (hi - lo > 100 && iterations < 60) {
    const mid = (lo + hi) / 2;
    const y = yoc(mid);
    iterations += 1;
    if (y === null || y < target) hi = mid;
    else lo = mid;
  }
  return result((lo + hi) / 2, iterations, null);
}
