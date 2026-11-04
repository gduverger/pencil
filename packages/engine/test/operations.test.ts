import { describe, expect, it } from 'vitest';
import { run } from '../src/run';
import { computeOperations, occupancyAt, commercialOccupancyAt } from '../src/operations';
import { computeProgram } from '../src/program';
import { buildTimeline } from '../src/timeline';
import { parseInputs } from '../src/schema';
import { fixtureDeal, fixtureInputs, simpleDeal } from './fixtures';

describe('7.7 lease-up and operations', () => {
  it('linear occupancy: occ_s × min(1, (t − O + 1) / L), occ_s from Z, zero before O', () => {
    const inputs = fixtureInputs(); // O = 30, L = 12, Z = 42, occ_s = 0.95
    const tl = buildTimeline(inputs);
    expect(occupancyAt(inputs, tl, 29)).toBe(0);
    expect(occupancyAt(inputs, tl, 30)).toBeCloseTo(0.95 / 12, 12);
    expect(occupancyAt(inputs, tl, 35)).toBeCloseTo((0.95 * 6) / 12, 12);
    expect(occupancyAt(inputs, tl, 41)).toBeCloseTo(0.95, 12);
    expect(occupancyAt(inputs, tl, 42)).toBe(0.95);
    expect(occupancyAt(inputs, tl, 100)).toBe(0.95);
  });

  it('units-per-month absorption: min(occ_s, units × (t − O + 1) / totalUnits)', () => {
    const inputs = fixtureInputs((d) => ({ ...d, operations: { ...d.operations, absorption: { kind: 'unitsPerMonth', units: 10 } } }));
    const tl = buildTimeline(inputs);
    // 10 of 60 units per month: 1/6, 2/6, ..., capped at 0.95 from month O + 5
    expect(occupancyAt(inputs, tl, 30)).toBeCloseTo(10 / 60, 12);
    expect(occupancyAt(inputs, tl, 32)).toBeCloseTo(30 / 60, 12);
    expect(occupancyAt(inputs, tl, 35)).toBe(0.95);
    expect(occupancyAt(inputs, tl, 42)).toBe(0.95);
  });

  it('EGI, opex lines and NOI match the hand computation for the simple deal at month 18', () => {
    // Simple deal: O = 18 (year 2, so rent and expense growth of 3% apply once), 10 units at $2,500.
    // GPR = 10 × 2,500 × 1.03 = 25,750; occ = 0.95 (L = 0); credit loss 0.5%
    // residential EGI = 25,750 × 0.95 × 0.995 = 24,340.19; other income 0
    // taxes = 30,000 / 12 × 1.03 = 2,575
    // per-unit lines (600 + 500 + 1,200 + 500 + 300 + 200 + 300 = 3,600 per unit) × 10 / 12 × 1.03 = 3,090
    // management 3% × 24,340.19 = 730.21; opex = 6,395.21; NOI = 17,944.98
    const inputs = parseInputs(simpleDeal());
    const tl = buildTimeline(inputs);
    const ops = computeOperations(inputs, computeProgram(inputs), tl);
    expect(ops.gpr[18]).toBeCloseTo(25750, 6);
    expect(ops.occupancy[18]).toBe(0.95);
    expect(ops.egi[18]).toBeCloseTo(24340.1875, 4);
    expect(ops.vacancyAndCreditLoss[18]).toBeCloseTo(25750 - 24340.1875, 4);
    expect(ops.opex.taxes[18]).toBeCloseTo(2575, 6);
    expect(ops.opex.insurance[18]! + ops.opex.repairs[18]! + ops.opex.payroll[18]! + ops.opex.utilities[18]! + ops.opex.admin[18]! + ops.opex.marketing[18]! + ops.opex.reserves[18]!).toBeCloseTo(3090, 6);
    expect(ops.opex.management[18]).toBeCloseTo(0.03 * 24340.1875, 4);
    expect(ops.opexTotal[18]).toBeCloseTo(2575 + 3090 + 730.205625, 4);
    expect(ops.noi[18]).toBeCloseTo(24340.1875 - 6395.205625, 4);
    // Nothing before O
    expect(ops.gpr[17]).toBe(0);
    expect(ops.noi[17]).toBe(0);
    // Projected through S + 12 = 72
    expect(ops.length).toBe(73);
    expect(ops.noi[72]).toBeGreaterThan(0);
  });

  it('expenses grow by the annual step from month 0 and are fixed with respect to occupancy', () => {
    const inputs = fixtureInputs();
    const tl = buildTimeline(inputs);
    const ops = computeOperations(inputs, computeProgram(inputs), tl);
    // Insurance 600 × 60 / 12 = 3,000 × 1.03^2 at months 24–35 (O = 30 is in year 3)
    expect(ops.opex.insurance[30]).toBeCloseTo(3000 * 1.03 * 1.03, 6);
    expect(ops.opex.insurance[35]).toBeCloseTo(3000 * 1.03 * 1.03, 6);
    expect(ops.opex.insurance[36]).toBeCloseTo(3000 * Math.pow(1.03, 3), 6);
    // Taxes 250,000 / 12 × 1.03^2
    expect(ops.opex.taxes[30]).toBeCloseTo((250000 / 12) * 1.03 * 1.03, 6);
  });

  it('commercial income and opex follow their own lease-up when the switch is on', () => {
    const inputs = fixtureInputs((d) => ({
      ...d,
      program: { ...d.program, commercial: { enabled: true, grossSF: 4000, rentPerSFYear: 36, vacancyPct: 0.1, tiPerSF: 50, leaseUpMonths: 4, opexPerSFYear: 6 } },
    }));
    const tl = buildTimeline(inputs);
    const ops = computeOperations(inputs, computeProgram(inputs), tl);
    // Potential 4,000 × 36 / 12 = 12,000 per month × 1.03^2 (year 3) × (1 − 0.1); lease-up 1/4 at O
    const potential = 12000 * 1.03 * 1.03 * 0.9;
    expect(commercialOccupancyAt(inputs, tl, 30)).toBe(0.25);
    expect(ops.commercialIncome[30]).toBeCloseTo(potential * 0.25, 6);
    expect(ops.commercialIncome[33]).toBeCloseTo(potential, 6);
    expect(ops.commercialIncome[34]).toBeCloseTo(potential, 6);
    // Opex 4,000 × 6 / 12 = 2,000 × 1.03^2, fixed with respect to occupancy
    expect(ops.opex.commercial[30]).toBeCloseTo(2000 * 1.03 * 1.03, 6);
    expect(ops.opex.commercial[29]).toBe(0);
    const off = computeOperations(fixtureInputs(), computeProgram(fixtureInputs()), tl);
    expect(off.commercialIncome[33]).toBe(0);
    expect(off.opex.commercial[33]).toBe(0);
  });

  it('lease-up deficits are capitalized costs by default, or pro rata equity contributions when the switch is off', () => {
    const on = run(fixtureDeal());
    expect(on.totals.operatingDeficit).toBeGreaterThan(0);
    const deficitMonths = on.months.filter((m) => m.t >= 30 && m.t < 42 && m.noi < 0);
    expect(deficitMonths.length).toBeGreaterThan(0);
    for (const m of deficitMonths) {
      expect(m.costs.operatingDeficit).toBeCloseTo(-m.noi, 6);
      expect(m.deficitContribution).toBe(0);
    }
    const off = run({ ...fixtureDeal(), financing: { ...fixtureDeal().financing, capitalizeOperatingDeficits: false } });
    expect(off.totals.operatingDeficit).toBe(0);
    for (const m of off.months) {
      if (m.t >= 30 && m.t < 42 && m.noi < 0) {
        expect(m.costs.operatingDeficit).toBe(0);
        expect(m.deficitContribution).toBeCloseTo(-m.noi, 6);
        expect(m.contributions.gp).toBeCloseTo(m.equityIn.gp + m.equityIn.inKind + -m.noi * 0.1, 6);
        expect(m.contributions.lp).toBeCloseTo(m.equityIn.lp + -m.noi * 0.9, 6);
      }
    }
    // The deficits reduce TPC, so the loan and the development equity are smaller.
    expect(off.totals.tpc).toBeLessThan(on.totals.tpc);
  });

  it('positive NOI before the refinance month reduces the funding requirement and any surplus is distributed at R', () => {
    // Refinance 6 months after stabilization: months 42–47 are stabilized with no costs, so their
    // NOI accumulates as surplus and is distributed at R = 48.
    const out = run({ ...fixtureDeal(), financing: { ...fixtureDeal().financing, permanent: { ...fixtureDeal().financing!.permanent, monthsAfterStabilization: 6 } } });
    expect(out.timeline.R).toBe(48);
    const stabilizedNoi = out.months.slice(42, 48).reduce((s, m) => s + m.noi, 0);
    expect(stabilizedNoi).toBeGreaterThan(0);
    expect(out.totals.surplusDistributed).toBeGreaterThan(0);
    expect(out.totals.leaseUpNoi + out.totals.surplusDistributed).toBeCloseTo(out.months.slice(30, 48).reduce((s, m) => s + Math.max(0, m.noi), 0), 3);
    expect(out.months[48]!.refinance).toBeCloseTo((out.refinance?.net ?? 0) + out.totals.surplusDistributed, 6);
    expect(Math.abs(out.sourcesUses.totalSources - out.sourcesUses.totalUses)).toBeLessThan(0.01);
  });
});
