import { describe, expect, it } from 'vitest';
import { run } from '../src/run';
import { runScenario, runScenarios, sensitivity, sensitivityPresets, scenarioOverridesFromDeltas } from '../src/scenarios';
import { residualLandValue } from '../src/residual';
import { EngineError } from '../src/errors';
import { fixtureDeal } from './fixtures';

describe('FR-5 scenarios', () => {
  it('invariant 6: Likely with empty overrides equals a plain run, byte for byte', () => {
    expect(JSON.stringify(runScenario(fixtureDeal(), {}))).toBe(JSON.stringify(run(fixtureDeal())));
  });

  it('overrides apply by path and unlisted paths inherit the base', () => {
    const out = runScenario(fixtureDeal(), { 'exit.exitCapRatePct': 0.06, 'program.unitTypes[2BR].rentPerMonth': 3500 });
    expect(out.inputs.exit.exitCapRatePct).toBe(0.06);
    expect(out.inputs.program.unitTypes[2]!.rentPerMonth).toBe(3500);
    expect(out.inputs.program.unitTypes[1]!.rentPerMonth).toBe(2700);
    expect(out.inputs.costs.hard.perGrossSF).toBe(300);
  });

  it('default deltas make Best better and Worst worse than Likely', () => {
    const scenarios = scenarioOverridesFromDeltas(fixtureDeal());
    // rents ±5%, hard cost ∓10%
    expect(scenarios.best['program.unitTypes[1BR].rentPerMonth']).toBeCloseTo(2700 * 1.05, 9);
    expect(scenarios.worst['program.unitTypes[1BR].rentPerMonth']).toBeCloseTo(2700 * 0.95, 9);
    expect(scenarios.best['costs.hard.perGrossSF']).toBeCloseTo(270, 9);
    expect(scenarios.worst['costs.hard.perGrossSF']).toBeCloseTo(330, 9);
    const all = runScenarios(fixtureDeal(), scenarios);
    expect(all.best.metrics.projectIrr!).toBeGreaterThan(all.likely.metrics.projectIrr!);
    expect(all.worst.metrics.projectIrr!).toBeLessThan(all.likely.metrics.projectIrr!);
    expect(all.best.metrics.yieldOnCost!).toBeGreaterThan(all.likely.metrics.yieldOnCost!);
  });
});

describe('FR-6 sensitivities', () => {
  it('builds a grid where every cell is a full run and the base cell equals the scenario run', () => {
    const axisA = { path: 'exit.exitCapRatePct', values: [0.05, 0.055, 0.06] };
    const axisB = { path: 'operations.rentGrowthPct', values: [0.02, 0.03] };
    const grid = sensitivity(fixtureDeal(), {}, axisA, axisB, ['projectIrr', 'yieldOnCost', 'saleValue']);
    expect(grid.rows).toHaveLength(3);
    expect(grid.rows[0]).toHaveLength(2);
    expect(grid.base).toEqual({ a: 1, b: 1 });
    expect(grid.errors).toBe(0);
    const base = run(fixtureDeal());
    const cell = grid.rows[1]![1]!;
    expect(cell.metrics.projectIrr).toBe(base.metrics.projectIrr);
    expect(cell.metrics.saleValue).toBe(base.metrics.saleValue);
    // monotone in the exit cap along axis A
    expect(grid.rows[0]![1]!.metrics.saleValue!).toBeGreaterThan(grid.rows[2]![1]!.metrics.saleValue!);
    // only the requested metrics are present
    expect(Object.keys(cell.metrics).sort()).toEqual(['projectIrr', 'saleValue', 'yieldOnCost']);
  });

  it('applies the scenario overrides under the grid and records cells that fail', () => {
    const scenario = { 'costs.hard.perGrossSF': 330 };
    const grid = sensitivity(fixtureDeal(), scenario, { path: 'meta.holdMonths', values: [12, 120] }, { path: 'exit.exitCapRatePct', values: [0.055] }, ['projectIrr']);
    expect(grid.rows[0]![0]!.error).toContain('hold period');
    expect(grid.errors).toBe(1);
    expect(grid.base).toEqual({ a: 1, b: 0 });
    const expected = runScenario(fixtureDeal(), scenario).metrics.projectIrr;
    expect(grid.rows[1]![0]!.metrics.projectIrr).toBe(expected);
    expect(() => sensitivity(fixtureDeal(), {}, { path: 'x', values: [] }, { path: 'y', values: [1] }, ['projectIrr'])).toThrow(EngineError);
  });

  it('ships the three presets with the axes of FR-6.3 and runs the first under 2 s', () => {
    const presets = sensitivityPresets(fixtureDeal());
    expect(presets.map((p) => p.key)).toEqual(['exitCapXRentGrowth', 'hardCostXConstructionRate', 'vacancyXExitCap']);
    expect(presets[0]!.axisA.values).toEqual([0.045, 0.0475, 0.05, 0.0525, 0.055, 0.0575, 0.06, 0.0625, 0.065]);
    expect(presets[0]!.axisB.values).toEqual([0, 0.01, 0.02, 0.03, 0.04]);
    expect(presets[1]!.axisA.values.map((v) => v / 300)).toEqual([0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2]);
    expect(presets[1]!.axisB.values).toEqual([0.06, 0.065, 0.07, 0.075, 0.08, 0.085, 0.09, 0.095, 0.1]);
    expect(presets[2]!.axisA.values).toEqual([0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1]);
    const start = performance.now();
    const grid = sensitivity(fixtureDeal(), {}, presets[1]!.axisA, presets[1]!.axisB, ['projectIrr', 'lpIrr', 'yieldOnCost']);
    const elapsed = performance.now() - start;
    expect(grid.rows.length * grid.rows[0]!.length).toBe(81);
    expect(grid.base).toEqual({ a: 4, b: 4 });
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('7.12 residual land value', () => {
  it('returns landCost within $100 for a deal whose yield on cost already equals the target', () => {
    const base = run(fixtureDeal());
    const target = base.metrics.yieldOnCost!;
    const rlv = residualLandValue(fixtureDeal(), target);
    expect(Math.abs(rlv.landCost - 3_000_000)).toBeLessThanOrEqual(100);
    expect(rlv.atBound).toBeNull();
    expect(rlv.perUnit).toBeCloseTo(rlv.landCost / 60, 6);
    expect(rlv.perLotSF).toBeCloseTo(rlv.landCost / 60000, 6);
    expect(rlv.achievedYieldOnCost).toBeCloseTo(target, 5);
    expect(rlv.iterations).toBeGreaterThan(10);
  });

  it('defaults the target to exit cap + 150 bp and reports bracket bounds when the target is unreachable', () => {
    const rlv = residualLandValue(fixtureDeal());
    expect(rlv.targetYieldOnCost).toBeCloseTo(0.07, 12);
    // The fixture yields about 6.1% with $3M of land, so a 7% target needs much cheaper land; still above zero?
    expect(rlv.landCost).toBeGreaterThanOrEqual(0);
    const impossible = residualLandValue(fixtureDeal(), 0.5);
    expect(impossible.atBound).toBe('low');
    expect(impossible.landCost).toBe(0);
    const trivial = residualLandValue(fixtureDeal(), 0.001);
    expect(trivial.atBound).toBe('high');
    expect(trivial.landCost).toBe(15_000_000);
  });

  it('uses the TPC as the bracket top when the land cost is zero', () => {
    const d = fixtureDeal();
    const rlv = residualLandValue({ ...d, site: { ...d.site, landCost: 0 } }, 0.06);
    expect(rlv.bracket.lo).toBe(0);
    expect(rlv.bracket.hi).toBeGreaterThan(20_000_000);
    expect(rlv.landCost).toBeGreaterThan(0);
  });
});
