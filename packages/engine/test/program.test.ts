import { describe, expect, it } from 'vitest';
import { computeProgram, gprAt, otherIncomeAt } from '../src/program';
import { fixtureInputs } from './fixtures';

describe('7.3 program and revenue basis', () => {
  const inputs = fixtureInputs();
  const program = computeProgram(inputs);

  it('rounds units per type by largest remainder and sums to totalUnits', () => {
    // 60 × (0.1, 0.4, 0.4, 0.1) = 6, 24, 24, 6
    expect(program.unitTypes.map((u) => u.units)).toEqual([6, 24, 24, 6]);
    expect(program.unitTypes.reduce((s, u) => s + u.units, 0)).toBe(60);
  });

  it('computes NRSF, GSF and GSF_total', () => {
    // NRSF = 6×450 + 24×650 + 24×950 + 6×1200 = 2,700 + 15,600 + 22,800 + 7,200 = 48,300
    expect(program.nrsf).toBe(48300);
    // GSF = 48,300 / 0.85 = 56,823.53
    expect(program.gsf).toBeCloseTo(56823.5294, 3);
    expect(program.commercialSF).toBe(0);
    expect(program.gsfTotal).toBeCloseTo(program.gsf, 9);
  });

  it('adds commercial gross SF to GSF_total only when the switch is on', () => {
    const on = computeProgram(
      fixtureInputs((d) => ({
        ...d,
        program: { ...d.program!, commercial: { enabled: true, grossSF: 5000 } },
      })),
    );
    expect(on.gsfTotal).toBeCloseTo(56823.5294 + 5000, 3);
    const off = computeProgram(
      fixtureInputs((d) => ({
        ...d,
        program: { ...d.program!, commercial: { enabled: false, grossSF: 5000 } },
      })),
    );
    expect(off.gsfTotal).toBeCloseTo(56823.5294, 3);
  });

  it('GPR(t) = Σ units_i × rent_i × g(rentGrowth, t)', () => {
    // month 0: 6×2200 + 24×2700 + 24×3300 + 6×3900 = 13,200 + 64,800 + 79,200 + 23,400 = 180,600
    expect(gprAt(inputs, program, 0)).toBe(180600);
    expect(gprAt(inputs, program, 11)).toBe(180600);
    // month 12: × 1.03 = 186,018
    expect(gprAt(inputs, program, 12)).toBeCloseTo(186018, 6);
  });

  it('applies the affordable discount to the affordable share of each type', () => {
    const aff = fixtureInputs((d) => ({
      ...d,
      program: {
        ...d.program!,
        affordable: { enabled: true, pctUnits: 0.2, rentDiscountPct: 0.5 },
      },
    }));
    const p = computeProgram(aff);
    // 20% of units at half rent → GPR × (1 − 0.2 × 0.5) = 180,600 × 0.9 = 162,540
    expect(gprAt(aff, p, 0)).toBeCloseTo(162540, 6);
  });

  it('OI(t) = totalUnits × otherIncomePerUnitMonth × g(otherIncomeGrowth, t)', () => {
    // 60 × 75 = 4,500; month 12 → 4,635
    expect(otherIncomeAt(inputs, 0)).toBe(4500);
    expect(otherIncomeAt(inputs, 12)).toBeCloseTo(4635, 6);
  });
});
