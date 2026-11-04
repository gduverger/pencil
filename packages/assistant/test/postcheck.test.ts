import { describe, expect, it } from 'vitest';
import { checkNumbers, extractNumbers, numbersInData } from '../src/postcheck';

describe('10.5 number post-check', () => {
  it('extracts currency, percentage and multiple tokens', () => {
    const t = extractNumbers(
      'Rent of $3,400 is above the $2,700–$3,200 range; vacancy 5.5%, multiple 1.63x, $2.1M of equity.',
    );
    expect(t.map((x) => x.value)).toEqual([3400, 2700, 3200, 0.055, 1.63, 2_100_000]);
    expect(t.map((x) => x.kind)).toEqual([
      'currency',
      'currency',
      'currency',
      'percent',
      'plain',
      'currency',
    ]);
  });

  it('collects every number in nested data', () => {
    const s = numbersInData({ a: 1, b: { c: [2, '3'], d: 'rent $4,000 at 5%' }, e: null });
    expect([...s].sort((x, y) => x - y)).toEqual([0.05, 1, 2, 3, 4000]);
  });

  it('accepts numbers present in the data, allowing display rounding, and rejects the rest', () => {
    const data = { tpc: 29_006_938.12, irr: 0.1123, yoc: 0.0601, rent: 3300, perSF: 510.47 };
    expect(
      checkNumbers(
        'Total project cost is $29,007,000 at an 11.2% IRR and a 6.01% yield; rent $3,300; $510.47 per SF.',
        data,
      ).ok,
    ).toBe(true);
    const bad = checkNumbers('Total project cost is $31,000,000 at a 14% IRR.', data);
    expect(bad.ok).toBe(false);
    expect(bad.offending.map((t) => t.raw)).toEqual(['$31,000,000', '14%']);
    // "$29.0M" rounds within tolerance; "$3.3k" too
    expect(checkNumbers('About $29.0M and $3.3k.', data).ok).toBe(true);
    // No numbers at all is fine
    expect(checkNumbers('A plain sentence.', data).ok).toBe(true);
  });
});
