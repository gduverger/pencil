import { describe, expect, it } from 'vitest';
import { applyOverrides, getPath, parsePath, setPath } from '../src/paths';
import { fixtureInputs } from './fixtures';

describe('FR-1.3 dotted paths', () => {
  it('parses keys and bracket selectors', () => {
    expect(parsePath('program.unitTypes[1BR].rentPerMonth')).toEqual([
      { kind: 'key', key: 'program' },
      { kind: 'key', key: 'unitTypes' },
      { kind: 'select', selector: '1BR' },
      { kind: 'key', key: 'rentPerMonth' },
    ]);
  });

  it('reads and writes nested values, selecting array elements by key or id', () => {
    const inputs = fixtureInputs();
    expect(getPath(inputs, 'costs.hard.perGrossSF')).toBe(300);
    expect(getPath(inputs, 'program.unitTypes[2BR].rentPerMonth')).toBe(3300);
    expect(getPath(inputs, 'program.unitTypes[1].rentPerMonth')).toBe(2700);
    const next = setPath(inputs, 'program.unitTypes[2BR].rentPerMonth', 3500);
    expect(getPath(next, 'program.unitTypes[2BR].rentPerMonth')).toBe(3500);
    expect(getPath(inputs, 'program.unitTypes[2BR].rentPerMonth')).toBe(3300); // original untouched
    expect(getPath(inputs, 'nope.nothing')).toBeUndefined();
  });

  it('applies a map of overrides', () => {
    const inputs = fixtureInputs();
    const next = applyOverrides(inputs, {
      'exit.exitCapRatePct': 0.06,
      'costs.hard.perGrossSF': 400,
    });
    expect(next.exit.exitCapRatePct).toBe(0.06);
    expect(next.costs.hard.perGrossSF).toBe(400);
  });
});

describe('paths: edge cases', () => {
  it('creates missing containers and keyed elements on write', () => {
    const next = setPath({} as Record<string, unknown>, 'a.b[k1].c', 5);
    expect(getPath(next, 'a.b[k1].c')).toBe(5);
    expect(getPath(next, 'a.b[0].key')).toBe('k1');
    const byIndex = setPath({ xs: [] as unknown[] }, 'xs[0].v', 1);
    expect(getPath(byIndex, 'xs[0].v')).toBe(1);
    const leaf = setPath({ xs: [1, 2] }, 'xs[1]', 9);
    expect(getPath(leaf, 'xs[1]')).toBe(9);
    expect(setPath({ a: 1 }, '', 2)).toEqual({ a: 1 });
    expect(getPath({ a: 1 }, 'a[0]')).toBeUndefined();
    expect(getPath({ a: [{ id: 'z' }] }, 'a[q]')).toBeUndefined();
    expect(getPath(null, 'a')).toBeUndefined();
  });
});
