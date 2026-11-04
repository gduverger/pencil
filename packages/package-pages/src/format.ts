/**
 * Presentation rounding and formatting (spec 7.13). This is the only place numbers are rounded;
 * the engine returns full precision. Parts and totals are rounded independently and every table
 * carries ROUNDING_FOOTNOTE.
 */
import type { Unit } from '@pencil/engine';

export const ROUNDING_FOOTNOTE = 'Figures rounded; totals may not foot.';

export interface RoundingPreferences {
  /** USD at or above this threshold round to the nearest $1,000 (default 100,000). */
  usdThousandsFrom: number;
}

export const DEFAULT_ROUNDING: RoundingPreferences = { usdThousandsFrom: 100_000 };

/** usd ≥ 100,000 → nearest $1,000; usd < 100,000 → nearest $100. */
export function roundUsd(x: number, prefs: RoundingPreferences = DEFAULT_ROUNDING): number {
  const step = Math.abs(x) >= prefs.usdThousandsFrom ? 1000 : 100;
  return Math.round(x / step) * step;
}

const intFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const twoDecimals = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function wrapNegative(s: string, negative: boolean, parens: boolean): string {
  if (!negative) return s;
  return parens ? `(${s})` : `−${s}`;
}

export interface FormatOptions {
  /** Negative numbers in parentheses (tables) instead of a minus sign (prose). Default true. */
  parens?: boolean;
  /** Replace a null or undefined value with this string. Default "—". */
  empty?: string;
  rounding?: RoundingPreferences;
}

export function formatUsd(x: number | null | undefined, opts: FormatOptions = {}): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return opts.empty ?? '—';
  const rounded = roundUsd(x, opts.rounding);
  return wrapNegative(`$${intFormatter.format(Math.abs(rounded))}`, rounded < 0, opts.parens ?? true);
}

/** $/SF → 2 decimals. */
export function formatUsdPerSF(x: number | null | undefined, opts: FormatOptions = {}): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return opts.empty ?? '—';
  return wrapNegative(`$${twoDecimals.format(Math.abs(x))}`, x < 0, opts.parens ?? true);
}

/** $/unit and $/unit/month → nearest $1. */
export function formatUsdWhole(x: number | null | undefined, opts: FormatOptions = {}): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return opts.empty ?? '—';
  const rounded = Math.round(x);
  return wrapNegative(`$${intFormatter.format(Math.abs(rounded))}`, rounded < 0, opts.parens ?? true);
}

/** Percentages and rates → 2 decimals. */
export function formatPct(x: number | null | undefined, opts: FormatOptions = {}): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return opts.empty ?? '—';
  return wrapNegative(`${twoDecimals.format(Math.abs(x * 100))}%`, x < 0, opts.parens ?? false);
}

/** IRR → 1 decimal. */
export function formatIrr(x: number | null | undefined, opts: FormatOptions = {}): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return opts.empty ?? 'n/a';
  const v = Math.abs(x * 100).toFixed(1);
  return wrapNegative(`${v}%`, x < 0, opts.parens ?? false);
}

/** Multiples → 2 decimals with an x suffix. */
export function formatMultiple(x: number | null | undefined, opts: FormatOptions = {}): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return opts.empty ?? 'n/a';
  return `${twoDecimals.format(x)}x`;
}

export function formatInteger(x: number | null | undefined, opts: FormatOptions = {}): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return opts.empty ?? '—';
  const rounded = Math.round(x);
  return wrapNegative(intFormatter.format(Math.abs(rounded)), rounded < 0, opts.parens ?? true);
}

export function formatCount(x: number | null | undefined, opts: FormatOptions = {}): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return opts.empty ?? '—';
  return Number.isInteger(x) ? intFormatter.format(x) : twoDecimals.format(x);
}

/** Format any input or output value by its unit (FR-1.4). */
export function formatByUnit(value: unknown, unit: Unit | 'irr' | 'multiple', opts: FormatOptions = {}): string {
  if (value === null || value === undefined) return opts.empty ?? '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;
  if (typeof value !== 'number') return JSON.stringify(value);
  switch (unit) {
    case 'usd':
      return formatUsd(value, opts);
    case 'usd_per_sf':
      return formatUsdPerSF(value, opts);
    case 'usd_per_unit':
    case 'usd_per_unit_month':
      return formatUsdWhole(value, opts);
    case 'pct':
    case 'rate_pct':
      return formatPct(value, opts);
    case 'irr':
      return formatIrr(value, opts);
    case 'multiple':
      return formatMultiple(value, opts);
    case 'sf':
    case 'units':
    case 'months':
      return formatInteger(value, opts);
    case 'count':
      return formatCount(value, opts);
    case 'flag':
      return value ? 'Yes' : 'No';
    case 'text':
    default:
      return String(value);
  }
}

/** Short unit suffix for table headers. */
export function unitSuffix(unit: Unit): string {
  switch (unit) {
    case 'usd':
      return '$';
    case 'usd_per_sf':
      return '$/SF';
    case 'usd_per_unit':
      return '$/unit/yr';
    case 'usd_per_unit_month':
      return '$/unit/mo';
    case 'pct':
    case 'rate_pct':
      return '%';
    case 'sf':
      return 'SF';
    case 'units':
      return 'units';
    case 'months':
      return 'months';
    default:
      return '';
  }
}

/** Month index → "Jan 2027" given the analysis month "2026-01". */
export function monthLabel(analysisMonth: string, t: number): string {
  const [y, m] = analysisMonth.split('-').map(Number);
  const year = y ?? 2026;
  const month0 = (m ?? 1) - 1 + t;
  const date = new Date(Date.UTC(year + Math.floor(month0 / 12), ((month0 % 12) + 12) % 12, 1));
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
