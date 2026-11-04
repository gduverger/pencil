/**
 * Scenarios (FR-5) and sensitivities (FR-6, 7.14). Likely is the base; Best and Worst are maps
 * of input path → override value. A sensitivity cell is a full engine run with two overrides
 * applied on top of a scenario.
 */
import { EngineError } from './errors';
import { getPath, applyOverrides, type Path } from './paths';
import { run } from './run';
import { parseInputs, type DealInputs } from './schema';
import type { DealOutputs, MetricKey } from './types';

export type ScenarioKey = 'likely' | 'best' | 'worst';
export const SCENARIO_KEYS: ScenarioKey[] = ['likely', 'best', 'worst'];

export type Overrides = Record<Path, unknown>;

export interface ScenarioSet {
  best: Overrides;
  worst: Overrides;
}

/** Apply overrides to the base inputs and run. Empty overrides reproduce `run(inputs)` exactly. */
export function runScenario(inputs: unknown, overrides: Overrides): DealOutputs {
  const base = parseInputs(inputs);
  const merged = Object.keys(overrides).length === 0 ? base : applyOverrides(base, overrides);
  return run(merged);
}

/** Run Likely, Best and Worst side by side. */
export function runScenarios(inputs: unknown, scenarios: ScenarioSet): Record<ScenarioKey, DealOutputs> {
  return {
    likely: runScenario(inputs, {}),
    best: runScenario(inputs, scenarios.best),
    worst: runScenario(inputs, scenarios.worst),
  };
}

/** Default Best/Worst deltas (FR-11.1): rents ±5%, hard cost ∓10%. */
export interface ScenarioDeltas {
  rentPct: number;
  hardCostPct: number;
}
export const DEFAULT_SCENARIO_DELTAS: ScenarioDeltas = { rentPct: 0.05, hardCostPct: 0.1 };

/** Build Best and Worst override maps from the base inputs and symmetric deltas. */
export function scenarioOverridesFromDeltas(inputs: unknown, deltas: ScenarioDeltas = DEFAULT_SCENARIO_DELTAS): ScenarioSet {
  const base = parseInputs(inputs);
  const best: Overrides = {};
  const worst: Overrides = {};
  for (const u of base.program.unitTypes) {
    best[`program.unitTypes[${u.key}].rentPerMonth`] = u.rentPerMonth * (1 + deltas.rentPct);
    worst[`program.unitTypes[${u.key}].rentPerMonth`] = u.rentPerMonth * (1 - deltas.rentPct);
  }
  best['costs.hard.perGrossSF'] = base.costs.hard.perGrossSF * (1 - deltas.hardCostPct);
  worst['costs.hard.perGrossSF'] = base.costs.hard.perGrossSF * (1 + deltas.hardCostPct);
  return { best, worst };
}

export interface Axis {
  path: Path;
  values: number[];
}

export interface GridCell {
  a: number;
  b: number;
  metrics: Record<MetricKey, number | null>;
  error?: string;
}

export interface Grid {
  scenario: Overrides;
  axisA: Axis;
  axisB: Axis;
  metrics: MetricKey[];
  /** rows[i][j] is the cell for axisA.values[i] × axisB.values[j]. */
  rows: GridCell[][];
  /** Indexes of the axis values equal to the scenario's own inputs, when present. */
  base: { a: number | null; b: number | null };
  errors: number;
}

const REL_TOL = 1e-9;

function indexOfValue(values: number[], target: unknown): number | null {
  if (typeof target !== 'number') return null;
  const i = values.findIndex((v) => Math.abs(v - target) <= REL_TOL * Math.max(1, Math.abs(target)));
  return i >= 0 ? i : null;
}

/** Two-input grid on any metrics, computed on demand (FR-6.1). */
export function sensitivity(inputs: unknown, scenario: Overrides, axisA: Axis, axisB: Axis, metrics: MetricKey[]): Grid {
  if (axisA.values.length === 0 || axisB.values.length === 0) throw new EngineError('empty-axis', 'each sensitivity axis needs at least one value');
  const base = parseInputs(inputs);
  const scenarioInputs = Object.keys(scenario).length === 0 ? base : applyOverrides(base, scenario);
  const pick = (out: DealOutputs) => {
    const m = {} as Record<MetricKey, number | null>;
    for (const k of metrics) m[k] = out.metrics[k];
    return m;
  };
  let errors = 0;
  const rows: GridCell[][] = axisA.values.map((a, i) =>
    axisB.values.map((b, j) => {
      try {
        const out = run(applyOverrides(scenarioInputs, { [axisA.path]: a, [axisB.path]: b }));
        return { a: i, b: j, metrics: pick(out) };
      } catch (e) {
        errors += 1;
        const empty = {} as Record<MetricKey, number | null>;
        for (const k of metrics) empty[k] = null;
        return { a: i, b: j, metrics: empty, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return {
    scenario,
    axisA,
    axisB,
    metrics,
    rows,
    base: { a: indexOfValue(axisA.values, getPath(scenarioInputs, axisA.path)), b: indexOfValue(axisB.values, getPath(scenarioInputs, axisB.path)) },
    errors,
  };
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  const n = Math.round((to - from) / step);
  for (let i = 0; i <= n; i++) out.push(Number((from + i * step).toPrecision(12)));
  return out;
}

export interface SensitivityPreset {
  key: 'exitCapXRentGrowth' | 'hardCostXConstructionRate' | 'vacancyXExitCap';
  label: string;
  axisA: Axis;
  axisB: Axis;
}

/**
 * The three presets of FR-6.3, with relative axes built from the deal's own values:
 * exit cap (4.5–6.5% by 0.25) × rent growth (0–4% by 1); hard cost $/SF (±20% by 5%) ×
 * construction rate (±200 bp by 50); stabilized vacancy (3–10%) × exit cap.
 */
export function sensitivityPresets(inputs: unknown): SensitivityPreset[] {
  const base = parseInputs(inputs);
  const hard = base.costs.hard.perGrossSF;
  const rate = base.financing.constructionLoan.ratePct;
  return [
    {
      key: 'exitCapXRentGrowth',
      label: 'Exit cap rate × rent growth',
      axisA: { path: 'exit.exitCapRatePct', values: range(0.045, 0.065, 0.0025) },
      axisB: { path: 'operations.rentGrowthPct', values: range(0, 0.04, 0.01) },
    },
    {
      key: 'hardCostXConstructionRate',
      label: 'Hard cost per SF × construction loan rate',
      axisA: { path: 'costs.hard.perGrossSF', values: range(-0.2, 0.2, 0.05).map((d) => Number((hard * (1 + d)).toPrecision(12))) },
      axisB: { path: 'financing.constructionLoan.ratePct', values: range(-0.02, 0.02, 0.005).map((d) => Number((rate + d).toPrecision(12))) },
    },
    {
      key: 'vacancyXExitCap',
      label: 'Stabilized vacancy × exit cap rate',
      axisA: { path: 'operations.stabilizedVacancyPct', values: range(0.03, 0.1, 0.01) },
      axisB: { path: 'exit.exitCapRatePct', values: range(0.045, 0.065, 0.0025) },
    },
  ];
}

export type { DealInputs };
