import { describe, expect, it } from 'vitest';
import { defaultStabilizedTax, lookupParcel, lookupTown, parseAddress, parseCsv, towns } from '../src/index';

describe('town table (9.5)', () => {
  it('loads the bundled Massachusetts towns with clusters and tax rates', () => {
    const all = towns();
    expect(all.length).toBeGreaterThan(40);
    const needham = lookupTown('needham')!;
    expect(needham.cluster).toBe('inner-suburbs');
    expect(needham.residentialTaxRate).toBeGreaterThan(5);
    expect(needham.mbtaStatus).toContain('commuter rail');
    expect(lookupTown('Nowhere')).toBeUndefined();
    for (const t of all) expect(['boston-core', 'inner-suburbs', 'outer-suburbs', 'gateway-cities', 'other-ma']).toContain(t.cluster);
  });

  it('parses addresses in the common forms', () => {
    expect(parseAddress('120 Highland Avenue, Needham, MA 02494')).toMatchObject({ street: '120 Highland Avenue', town: 'Needham', state: 'MA', zip: '02494' });
    expect(parseAddress('120 Highland Avenue, Needham MA')).toMatchObject({ town: 'Needham', state: 'MA' });
    expect(parseAddress('120 Highland Avenue Needham MA').town).toBe('Needham');
    expect(parseAddress('').town).toBeUndefined();
  });

  it('parcel lookup without a dataset returns unknown sources, the town facts and a note', () => {
    const p = lookupParcel('120 Highland Avenue, Needham, MA 02494', { today: '2026-11-04' });
    expect(p.town?.town).toBe('Needham');
    expect(p.lotSF).toEqual({ value: null, source: 'unknown' });
    expect(p.assessedValue.source).toBe('unknown');
    expect(p.notes.some((n) => n.includes('not loaded'))).toBe(true);
    expect(p.notes.some((n) => n.includes('MBTA community'))).toBe(true);
    expect(p.lookupDate).toBe('2026-11-04');
    const nowhere = lookupParcel('1 Main St, Nowhere, MA');
    expect(nowhere.town).toBeUndefined();
    expect(nowhere.notes[0]).toContain('not in the Massachusetts town table');
  });

  it('parcel lookup with a dataset fills the fields with parcel-data sources', () => {
    const p = lookupParcel('120 Highland Avenue, Needham, MA', {
      dataset: { find: () => ({ lotSF: { value: 60000, source: 'parcel-data' }, zoningDistrict: { value: 'NB-MF', source: 'parcel-data' }, envelope: { unitsByRight: 80, rule: '15 units per acre' } }) },
    });
    expect(p.lotSF).toEqual({ value: 60000, source: 'parcel-data' });
    expect(p.zoningDistrict.value).toBe('NB-MF');
    expect(p.envelope.unitsByRight).toBe(80);
    expect(p.assessedValue.source).toBe('unknown');
  });

  it('defaults the stabilized tax from the town rate and an 85% assessment ratio', () => {
    const needham = lookupTown('Needham')!;
    // rate/1000 × 0.85 × 30,000,000
    expect(defaultStabilizedTax(needham, 30_000_000)).toBeCloseTo((needham.residentialTaxRate! / 1000) * 0.85 * 30_000_000, 6);
    expect(defaultStabilizedTax(undefined, 1)).toBeNull();
  });

  it('parses quoted CSV fields', () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"']]);
  });
});
