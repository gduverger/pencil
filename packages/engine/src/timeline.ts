/** Phase boundaries (7.1): predevelopment [0, P), construction [P, O), lease-up [O, Z), stabilized [Z, S]. */
import type { DealInputs } from './schema';
import type { Phase, TimelineSummary } from './types';

export interface Timeline {
  P: number;
  O: number;
  Z: number;
  /** Refinance month when the permanent loan is on; otherwise Z, the end of the capitalization window. */
  R: number;
  S: number;
  permanentEnabled: boolean;
}

export function buildTimeline(inputs: DealInputs): Timeline {
  const P = inputs.timeline.predevMonths;
  const O = P + inputs.timeline.constructionMonths;
  const Z = O + inputs.timeline.leaseUpMonths;
  const permanentEnabled = inputs.financing.permanent.enabled;
  const R = permanentEnabled ? Z + inputs.financing.permanent.monthsAfterStabilization : Z;
  const S = inputs.meta.holdMonths;
  return { P, O, Z, R, S, permanentEnabled };
}

export function phaseAt(tl: Timeline, t: number): Phase {
  if (t === tl.S) return 'sale';
  if (t < tl.P) return 'predevelopment';
  if (t < tl.O) return 'construction';
  if (t < tl.Z) return 'leaseUp';
  return 'stabilized';
}

export function timelineSummary(tl: Timeline, analysisMonth: string): TimelineSummary {
  return { analysisMonth, ...tl, monthCount: tl.S + 1 };
}
