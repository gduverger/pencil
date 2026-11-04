import type { DealInputsInput } from '../../src/schema';

export interface GoldenValue {
  cell?: string;
  cells?: string[];
  value: number | string | null | Array<number | string | null>;
}

export interface GoldenFile {
  model: string;
  file: string;
  inputs: Record<string, GoldenValue>;
  expected: Record<string, GoldenValue>;
  missing: string[];
  notes: string[];
}

export interface GoldenTolerances {
  /** Relative money tolerance (default 0.005) and absolute floor (default 1,000). */
  moneyRel?: number;
  moneyAbs?: number;
  /** IRR tolerance in decimal points (default 0.0025). */
  irr?: number;
  /** Annual series tolerance per year (default 0.01). */
  annual?: number;
  /** Per-metric overrides, e.g. { capitalizedInterest: { moneyRel: 0.02 } }. */
  perMetric?: Record<string, { moneyRel?: number; moneyAbs?: number; irr?: number; annual?: number }>;
}

export interface GoldenAdaptation {
  inputs: DealInputsInput;
  notes: string[];
  tolerances: GoldenTolerances;
}

export type GoldenAdapter = (golden: GoldenFile) => GoldenAdaptation;
