import { describe, expect, it } from 'vitest';
import { formatByUnit, formatIrr, formatMultiple, formatPct, formatUsd, formatUsdPerSF, formatUsdWhole, monthLabel, roundUsd } from '../src/format';

describe('7.13 rounding (presentation layer)', () => {
  it('rounds usd ≥ 100,000 to the nearest $1,000 and smaller amounts to the nearest $100', () => {
    expect(roundUsd(1_234_567)).toBe(1_235_000);
    expect(roundUsd(99_949)).toBe(99_900);
    expect(roundUsd(99_950)).toBe(100_000);
    expect(roundUsd(100_000)).toBe(100_000);
    expect(roundUsd(100_499)).toBe(100_000);
    expect(roundUsd(100_500)).toBe(101_000);
    expect(roundUsd(-1_234_567)).toBe(-1_235_000);
    expect(roundUsd(0)).toBe(0);
  });

  it('formats money with parentheses for negatives in tables', () => {
    expect(formatUsd(1_234_567)).toBe('$1,235,000');
    expect(formatUsd(-1_234_567)).toBe('($1,235,000)');
    expect(formatUsd(-1_234_567, { parens: false })).toBe('−$1,235,000');
    expect(formatUsd(null)).toBe('—');
    expect(formatUsdPerSF(602.4567)).toBe('$602.46');
    expect(formatUsdWhole(2699.6)).toBe('$2,700');
  });

  it('formats percentages to 2 decimals, IRRs to 1, multiples to 2', () => {
    expect(formatPct(0.055)).toBe('5.50%');
    expect(formatPct(-0.0041)).toBe('−0.41%');
    expect(formatIrr(0.10234)).toBe('10.2%');
    expect(formatIrr(null)).toBe('n/a');
    expect(formatMultiple(1.6267)).toBe('1.63x');
  });

  it('formats by unit', () => {
    expect(formatByUnit(56823.53, 'sf')).toBe('56,824');
    expect(formatByUnit(60, 'units')).toBe('60');
    expect(formatByUnit(1.25, 'count')).toBe('1.25');
    expect(formatByUnit(true, 'flag')).toBe('Yes');
    expect(formatByUnit('scurve', 'text')).toBe('scurve');
    expect(formatByUnit(0.08, 'rate_pct')).toBe('8.00%');
    expect(formatByUnit(undefined, 'usd')).toBe('—');
  });

  it('labels months from the analysis month', () => {
    expect(monthLabel('2026-01', 0)).toBe('Jan 2026');
    expect(monthLabel('2026-01', 11)).toBe('Dec 2026');
    expect(monthLabel('2026-01', 12)).toBe('Jan 2027');
    expect(monthLabel('2026-11', 120)).toBe('Nov 2036');
  });
});
