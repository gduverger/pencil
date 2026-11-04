/** Display and parsing of bare numbers per unit (FR-1.4): percentages are typed as 5.5 for 5.5%. */
import type { Unit } from '@pencil/engine';

export function toDisplay(value: unknown, unit: Unit): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value !== 'number') return String(value);
  switch (unit) {
    case 'pct':
    case 'rate_pct':
      return trim(value * 100, 4);
    case 'usd_per_sf':
      return trim(value, 2);
    case 'usd':
    case 'usd_per_unit':
    case 'usd_per_unit_month':
      return trim(value, 2);
    default:
      return trim(value, 4);
  }
}

function trim(x: number, decimals: number): string {
  const s = x.toFixed(decimals);
  return s.replace(/\.?0+$/, '');
}

/** Parse what the user typed into the stored value, or `undefined` when unparsable. */
export function fromDisplay(text: string, unit: Unit): unknown {
  const t = text.trim();
  if (unit === 'text') return t;
  if (unit === 'flag') return t === 'true' || t === 'yes' || t === 'on' || t === '1';
  if (t === '') return undefined;
  const n = Number(t.replace(/[$,%\s]/g, ''));
  if (!Number.isFinite(n)) return undefined;
  if (unit === 'pct' || unit === 'rate_pct') return n / 100;
  return n;
}

export function unitLabel(unit: Unit): string {
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
    case 'count':
      return '';
    default:
      return '';
  }
}

export function formatRange(low: number, high: number, unit: Unit): string {
  const f = (v: number) => {
    switch (unit) {
      case 'pct':
      case 'rate_pct':
        return `${trim(v * 100, 2)}%`;
      case 'usd_per_sf':
        return `$${v.toFixed(2)}`;
      case 'usd':
      case 'usd_per_unit':
      case 'usd_per_unit_month':
        return `$${Math.round(v).toLocaleString('en-US')}`;
      default:
        return trim(v, 2);
    }
  };
  return `${f(low)} – ${f(high)}`;
}
