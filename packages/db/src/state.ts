/**
 * The deal-state document stored in `deal_state` (spec 11.3) and the pure functions that change
 * it: input patches with append-only history (FR-1.2), elaboration with the auto-balancing
 * remainder child (FR-2), switches that retain hidden values (FR-3), events (FR-4), scenario
 * overrides (FR-5) and saved sensitivities with stale marking (FR-6). Nothing here computes a
 * financial number: sums of children go through the engine's `sumChildren`.
 */
import {
  applyOverrides,
  catalogEntry,
  computeProgram,
  inputCatalog,
  parseInputs,
  setPath,
  sumChildren,
  type DealInputs,
  type Distribution,
  type Grid,
  type MetricKey,
  type ScenarioKey,
  type Source,
  type Unit,
} from '@pencil/engine';
import type { PackageSettings } from '@pencil/package-pages';
import { DEFAULT_PACKAGE_SETTINGS } from '@pencil/package-pages';

export type Scenario = ScenarioKey;

export interface InputMeta {
  source: Source;
  note: string;
  updatedAt: string;
  updatedBy: string;
  benchmarkId: string | null;
}

export interface InputRecord extends InputMeta {
  value: unknown;
}

export interface ChildLine extends InputMeta {
  id: string;
  label: string;
  amount: number;
  distribution?: Distribution;
  /** The auto-balancing remainder created with the first child (FR-2.2). */
  remainder?: boolean;
}

export interface DealEventRecord extends InputMeta {
  id: string;
  label: string;
  month: number;
  amount: number;
  kind: 'cost' | 'inflow';
  category: 'land' | 'hard' | 'soft' | 'other' | 'inflow';
}

export const SWITCH_KEYS = [
  'commercial',
  'landLoan',
  'constructionInterestOnly',
  'permanent',
  'mezz',
  'operatingDeficitReserve',
  'affordable',
] as const;
export type SwitchKey = (typeof SWITCH_KEYS)[number];

export interface SwitchDefinition {
  key: SwitchKey;
  label: string;
  description: string;
  /** Engine path of the boolean the switch controls; null for the always-on construction IO. */
  enabledPath: string | null;
  /** Input paths revealed when on. */
  inputs: string[];
  default: boolean;
  fixed: boolean;
}

export const SWITCHES: SwitchDefinition[] = [
  {
    key: 'commercial',
    label: 'Commercial space',
    description: 'Ground-floor commercial space (simple, single tenant).',
    enabledPath: 'program.commercial.enabled',
    inputs: [
      'program.commercial.grossSF',
      'program.commercial.rentPerSFYear',
      'program.commercial.vacancyPct',
      'program.commercial.tiPerSF',
      'program.commercial.leaseUpMonths',
      'program.commercial.opexPerSFYear',
    ],
    default: false,
    fixed: false,
  },
  {
    key: 'landLoan',
    label: 'Land loan',
    description: 'A loan on the land at closing, rolled into the construction loan.',
    enabledPath: 'financing.landLoan.enabled',
    inputs: ['financing.landLoan.ltv', 'financing.landLoan.ratePct', 'financing.landLoan.feePct'],
    default: false,
    fixed: false,
  },
  {
    key: 'constructionInterestOnly',
    label: 'Construction loan interest-only',
    description: 'Always on in V1: construction interest is capitalized.',
    enabledPath: null,
    inputs: [],
    default: true,
    fixed: true,
  },
  {
    key: 'permanent',
    label: 'Permanent refinance',
    description: 'Refinance the construction loan with a permanent loan at stabilization.',
    enabledPath: 'financing.permanent.enabled',
    inputs: [
      'financing.permanent.monthsAfterStabilization',
      'financing.permanent.maxLTV',
      'financing.permanent.minDSCR',
      'financing.permanent.ratePct',
      'financing.permanent.amortYears',
      'financing.permanent.ioMonths',
      'financing.permanent.feePct',
      'financing.permanent.refiCapRatePct',
    ],
    default: true,
    fixed: false,
  },
  {
    key: 'mezz',
    label: 'Mezzanine tranche',
    description: 'A mezzanine tranche funded after equity and before the construction loan.',
    enabledPath: 'financing.mezz.enabled',
    inputs: [
      'financing.mezz.pctOfCost',
      'financing.mezz.ratePct',
      'financing.mezz.feePct',
      'financing.mezz.repaidAt',
    ],
    default: false,
    fixed: false,
  },
  {
    key: 'operatingDeficitReserve',
    label: 'Operating deficit reserve',
    description:
      'Lease-up deficits are capitalized into the budget and funded in order (off: equity funds them as they occur).',
    enabledPath: 'financing.capitalizeOperatingDeficits',
    inputs: [],
    default: true,
    fixed: false,
  },
  {
    key: 'affordable',
    label: 'Affordable units',
    description: 'A share of units at a discounted rent.',
    enabledPath: 'program.affordable.enabled',
    inputs: ['program.affordable.pctUnits', 'program.affordable.rentDiscountPct'],
    default: false,
    fixed: false,
  },
];

export const ELABORABLE_PATHS: string[] = inputCatalog()
  .filter((e) => e.elaborable)
  .map((e) => e.path);

export interface SavedSensitivity {
  id: string;
  key: string;
  label: string;
  scenario: Scenario;
  axisA: { path: string; values: number[] };
  axisB: { path: string; values: number[] };
  metrics: MetricKey[];
  grid: Grid;
  stale: boolean;
  ranAt: string;
  ranBy: string;
}

export interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  at: string;
  /** Applied setInput calls, when the message carried tool calls. */
  applied?: Array<{ path: string; value: unknown; source: Source; note: string }>;
}

export interface DealSetup {
  constructionType: 'wood-frame' | 'podium' | 'steel-concrete' | 'modular';
  townCluster:
    'boston-core' | 'inner-suburbs' | 'outer-suburbs' | 'gateway-cities' | 'other-ma' | null;
  town: string | null;
  address: string;
  parcel: {
    lotSF: number | null;
    zoningDistrict: string | null;
    mbtaCommunitiesDistrict: boolean | null;
    assessedValue: number | null;
    annualTax: number | null;
    unitsByRight: number | null;
    lookupDate: string | null;
    notes: string[];
  };
}

export interface DealState {
  inputs: Record<string, InputRecord>;
  elaboration: Record<string, ChildLine[]>;
  switches: Record<SwitchKey, boolean>;
  events: DealEventRecord[];
  scenarios: { best: Record<string, InputRecord>; worst: Record<string, InputRecord> };
  sensitivities: SavedSensitivity[];
  packageSettings: PackageSettings;
  assistantTranscript: TranscriptMessage[];
  setup: DealSetup;
}

export interface HistoryRow {
  scenario: Scenario;
  path: string;
  priorValue: unknown;
  priorSource: string | null;
  priorNote: string | null;
  changedBy: string;
  changedAt: string;
}

export interface InputPatch {
  scenario: Scenario;
  path: string;
  /** Omit to leave the value alone; for best/worst, `clear: true` removes the override. */
  value?: unknown;
  source?: Source;
  note?: string;
  clear?: boolean;
}

export class StateError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'StateError';
    this.code = code;
  }
}

/** Paths whose values live in `switches` rather than `inputs`. */
const SWITCH_PATHS = new Set(
  SWITCHES.map((s) => s.enabledPath).filter((p): p is string => p !== null),
);

export function defaultSwitches(): Record<SwitchKey, boolean> {
  const out = {} as Record<SwitchKey, boolean>;
  for (const s of SWITCHES) out[s.key] = s.default;
  return out;
}

export interface DefaultedInput {
  path: string;
  value: unknown;
  source: Source;
  note: string;
  benchmarkId: string | null;
}

/** A fresh deal state from resolved defaults (every catalogued path except switch flags). */
export function newDealState(
  defaults: DefaultedInput[],
  setup: DealSetup,
  actor: string,
  now: string,
  overrides: Partial<Record<string, DefaultedInput>> = {},
): DealState {
  const inputs: Record<string, InputRecord> = {};
  for (const d of defaults) {
    if (SWITCH_PATHS.has(d.path)) continue;
    const o = overrides[d.path] ?? d;
    inputs[d.path] = {
      value: o.value,
      source: o.source,
      note: o.note,
      updatedAt: now,
      updatedBy: actor,
      benchmarkId: o.benchmarkId,
    };
  }
  for (const [path, o] of Object.entries(overrides)) {
    if (!o || inputs[path] || SWITCH_PATHS.has(path)) continue;
    inputs[path] = {
      value: o.value,
      source: o.source,
      note: o.note,
      updatedAt: now,
      updatedBy: actor,
      benchmarkId: o.benchmarkId,
    };
  }
  return {
    inputs,
    elaboration: {},
    switches: defaultSwitches(),
    events: [],
    scenarios: { best: {}, worst: {} },
    sensitivities: [],
    packageSettings: { ...DEFAULT_PACKAGE_SETTINGS, pages: { ...DEFAULT_PACKAGE_SETTINGS.pages } },
    assistantTranscript: [],
    setup,
  };
}

/** The engine input document for a scenario, with elaboration, switches and events applied. */
export function toDealInputs(state: DealState, scenario: Scenario = 'likely'): DealInputs {
  let doc: Record<string, unknown> = {};
  for (const [path, rec] of Object.entries(state.inputs)) {
    if (rec.value === undefined || rec.value === null || rec.value === '') continue;
    doc = setPath(doc, path, rec.value);
  }
  for (const s of SWITCHES)
    if (s.enabledPath) doc = setPath(doc, s.enabledPath, state.switches[s.key]);
  // Elaboration: hard and soft become line items; other elaborable lines are replaced by the sum.
  for (const [path, children] of Object.entries(state.elaboration)) {
    if (children.length === 0) continue;
    if (path === 'costs.hard.perGrossSF')
      doc = setPath(
        doc,
        'costs.hard.lines',
        children.map((c) => ({
          label: c.label,
          amount: c.amount,
          ...(c.distribution ? { distribution: c.distribution } : {}),
        })),
      );
    else if (path === 'costs.soft.pctOfHard')
      doc = setPath(
        doc,
        'costs.soft.lines',
        children.map((c) => ({
          label: c.label,
          amount: c.amount,
          ...(c.distribution ? { distribution: c.distribution } : {}),
        })),
      );
    else doc = setPath(doc, path, sumChildren(children));
  }
  doc = setPath(
    doc,
    'events',
    state.events.map((e) => ({
      id: e.id,
      label: e.label,
      month: e.month,
      amount: e.amount,
      kind: e.kind,
      category: e.category,
      ...(e.note ? { note: e.note } : {}),
    })),
  );
  const base = parseInputs(doc);
  if (scenario === 'likely') return base;
  const overrides: Record<string, unknown> = {};
  for (const [path, rec] of Object.entries(state.scenarios[scenario])) overrides[path] = rec.value;
  return parseInputs(applyOverrides(base, overrides));
}

/** Scenario override maps in engine form (FR-5.1). */
export function scenarioOverrides(state: DealState): {
  best: Record<string, unknown>;
  worst: Record<string, unknown>;
} {
  const map = (recs: Record<string, InputRecord>) =>
    Object.fromEntries(Object.entries(recs).map(([p, r]) => [p, r.value]));
  return { best: map(state.scenarios.best), worst: map(state.scenarios.worst) };
}

function unitOf(path: string): Unit {
  return catalogEntry(path)?.unit ?? 'usd';
}

function coerce(path: string, value: unknown): unknown {
  const unit = unitOf(path);
  if (unit === 'text' || unit === 'flag') return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
    return Number(value);
  return value;
}

/** Apply input patches (FR-1.1, FR-1.2); returns the new state and the history rows to append. */
export function applyPatches(
  state: DealState,
  patches: InputPatch[],
  actor: string,
  now: string,
): { state: DealState; history: HistoryRow[] } {
  const next: DealState = {
    ...state,
    inputs: { ...state.inputs },
    scenarios: { best: { ...state.scenarios.best }, worst: { ...state.scenarios.worst } },
  };
  const history: HistoryRow[] = [];
  let changed = false;
  for (const p of patches) {
    if (SWITCH_PATHS.has(p.path))
      throw new StateError('switch-path', `${p.path} is a switch; use setSwitch`);
    if (state.elaboration[p.path]?.length && p.value !== undefined)
      throw new StateError('elaborated-parent', `${p.path} is elaborated; edit its children`);
    const target = p.scenario === 'likely' ? next.inputs : next.scenarios[p.scenario];
    const prior = target[p.path];
    if (p.scenario !== 'likely' && p.clear) {
      if (prior) {
        history.push({
          scenario: p.scenario,
          path: p.path,
          priorValue: prior.value,
          priorSource: prior.source,
          priorNote: prior.note,
          changedBy: actor,
          changedAt: now,
        });
        delete target[p.path];
        changed = true;
      }
      continue;
    }
    const value = p.value === undefined ? prior?.value : coerce(p.path, p.value);
    if (value === undefined && p.scenario !== 'likely')
      throw new StateError('override-needs-value', `an override for ${p.path} needs a value`);
    const source: Source = p.source ?? prior?.source ?? 'my-number';
    const note = p.note ?? prior?.note ?? '';
    const same =
      prior !== undefined &&
      JSON.stringify(prior.value) === JSON.stringify(value) &&
      prior.source === source &&
      prior.note === note;
    if (same) continue;
    if (prior)
      history.push({
        scenario: p.scenario,
        path: p.path,
        priorValue: prior.value,
        priorSource: prior.source,
        priorNote: prior.note,
        changedBy: actor,
        changedAt: now,
      });
    else
      history.push({
        scenario: p.scenario,
        path: p.path,
        priorValue: null,
        priorSource: null,
        priorNote: null,
        changedBy: actor,
        changedAt: now,
      });
    target[p.path] = {
      value,
      source,
      note,
      updatedAt: now,
      updatedBy: actor,
      benchmarkId:
        p.value === undefined ? (prior?.benchmarkId ?? null) : (prior?.benchmarkId ?? null),
    };
    changed = true;
  }
  return { state: changed ? markStale(next) : state, history };
}

/** Any input change marks saved sensitivities stale (FR-6.2). */
export function markStale(state: DealState): DealState {
  if (state.sensitivities.every((s) => s.stale)) return state;
  return {
    ...state,
    sensitivities: state.sensitivities.map((s) => (s.stale ? s : { ...s, stale: true })),
  };
}

export function setSwitch(
  state: DealState,
  key: SwitchKey,
  on: boolean,
  actor: string,
  now: string,
  values?: Record<string, { value: unknown; source?: Source; note?: string }>,
): { state: DealState; history: HistoryRow[] } {
  const def = SWITCHES.find((s) => s.key === key);
  if (!def) throw new StateError('unknown-switch', `unknown switch ${key}`);
  if (def.fixed) throw new StateError('fixed-switch', `${def.label} is always on in V1`);
  let next: DealState = { ...state, switches: { ...state.switches, [key]: on } };
  let history: HistoryRow[] = [];
  if (values) {
    const patches: InputPatch[] = Object.entries(values).map(([path, v]) => ({
      scenario: 'likely',
      path,
      value: v.value,
      ...(v.source ? { source: v.source } : {}),
      ...(v.note !== undefined ? { note: v.note } : {}),
    }));
    const r = applyPatches(next, patches, actor, now);
    next = r.state;
    history = r.history;
  }
  return {
    state: state.switches[key] === on && history.length === 0 ? state : markStale(next),
    history,
  };
}

let counter = 0;
export function newId(prefix: string, now: string): string {
  counter += 1;
  return `${prefix}-${now.replace(/[^0-9]/g, '').slice(0, 14)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Parent amount of an elaborable line in dollars (hard/soft lines are dollars; per-unit lines are $/unit/yr; carry lines are $/yr). */
export function elaborationParentAmount(state: DealState, path: string): number {
  if (!ELABORABLE_PATHS.includes(path))
    throw new StateError('not-elaborable', `${path} cannot be elaborated`);
  const inputs = toDealInputs(state, 'likely');
  if (path === 'costs.hard.perGrossSF') {
    const program = computeProgram(inputs);
    return state.elaboration[path]?.length
      ? sumChildren(state.elaboration[path]!)
      : inputs.costs.hard.perGrossSF * program.gsfTotal;
  }
  if (path === 'costs.soft.pctOfHard') {
    const program = computeProgram(inputs);
    const hard = state.elaboration['costs.hard.perGrossSF']?.length
      ? sumChildren(state.elaboration['costs.hard.perGrossSF']!)
      : inputs.costs.hard.perGrossSF * program.gsfTotal;
    return state.elaboration[path]?.length
      ? sumChildren(state.elaboration[path]!)
      : inputs.costs.soft.pctOfHard * hard;
  }
  const rec = state.inputs[path];
  return typeof rec?.value === 'number' ? rec.value : 0;
}

/** The unit of an elaborated line's children. */
export function childUnit(path: string): Unit {
  if (path === 'costs.hard.perGrossSF' || path === 'costs.soft.pctOfHard') return 'usd';
  return unitOf(path);
}

/** Add the first (or another) child; the first child creates an auto-balancing remainder (FR-2.2). */
export function addChild(
  state: DealState,
  path: string,
  child: {
    label: string;
    amount: number;
    source?: Source;
    note?: string;
    distribution?: Distribution;
  },
  actor: string,
  now: string,
): { state: DealState; history: HistoryRow[] } {
  const existing = state.elaboration[path] ?? [];
  const meta: InputMeta = {
    source: child.source ?? 'my-number',
    note: child.note ?? '',
    updatedAt: now,
    updatedBy: actor,
    benchmarkId: null,
  };
  const newChild: ChildLine = {
    id: newId('line', now),
    label: child.label,
    amount: child.amount,
    ...meta,
    ...(child.distribution ? { distribution: child.distribution } : {}),
  };
  const history: HistoryRow[] = [
    {
      scenario: 'likely',
      path: `${path}[${newChild.id}]`,
      priorValue: null,
      priorSource: null,
      priorNote: null,
      changedBy: actor,
      changedAt: now,
    },
  ];
  let children: ChildLine[];
  if (existing.length === 0) {
    const parentAmount = elaborationParentAmount(state, path);
    const remainder: ChildLine = {
      id: newId('line', now),
      label: 'Remainder',
      amount: parentAmount - child.amount,
      source: 'calculated',
      note: 'Auto-balancing remainder so the total does not jump; rename, edit or delete it.',
      updatedAt: now,
      updatedBy: actor,
      benchmarkId: null,
      remainder: true,
    };
    children = [newChild, remainder];
    history.push({
      scenario: 'likely',
      path: `${path}[${remainder.id}]`,
      priorValue: null,
      priorSource: null,
      priorNote: null,
      changedBy: actor,
      changedAt: now,
    });
  } else {
    children = [...existing, newChild];
    // Keep an existing remainder balancing while it exists.
    const rIdx = children.findIndex((c) => c.remainder);
    if (rIdx >= 0) {
      const parentAmount = sumChildren(existing);
      const others = children.filter((c, i) => i !== rIdx).reduce((s, c) => s + c.amount, 0);
      children[rIdx] = {
        ...children[rIdx]!,
        amount: parentAmount - others,
        updatedAt: now,
        updatedBy: actor,
      };
    }
  }
  return {
    state: markStale({ ...state, elaboration: { ...state.elaboration, [path]: children } }),
    history,
  };
}

/** Replace a child's fields; the remainder (if any) rebalances; deleting the last child restores the parent (FR-2.4). */
export function updateChild(
  state: DealState,
  path: string,
  id: string,
  changes: Partial<Pick<ChildLine, 'label' | 'amount' | 'source' | 'note' | 'distribution'>>,
  actor: string,
  now: string,
): { state: DealState; history: HistoryRow[] } {
  const children = state.elaboration[path] ?? [];
  const idx = children.findIndex((c) => c.id === id);
  if (idx < 0) throw new StateError('no-child', `no child ${id} under ${path}`);
  const prior = children[idx]!;
  const history: HistoryRow[] = [
    {
      scenario: 'likely',
      path: `${path}[${id}]`,
      priorValue: prior.amount,
      priorSource: prior.source,
      priorNote: prior.note,
      changedBy: actor,
      changedAt: now,
    },
  ];
  const updated: ChildLine = {
    ...prior,
    ...changes,
    updatedAt: now,
    updatedBy: actor,
    remainder: changes.amount !== undefined && prior.remainder ? false : prior.remainder,
  };
  const next = [...children];
  next[idx] = updated;
  // Rebalance a remaining remainder child so the parent total holds.
  const rIdx = next.findIndex((c) => c.remainder && c.id !== id);
  if (rIdx >= 0 && changes.amount !== undefined) {
    const total = sumChildren(children);
    const others = next.filter((_, i) => i !== rIdx).reduce((s, c) => s + c.amount, 0);
    next[rIdx] = { ...next[rIdx]!, amount: total - others, updatedAt: now, updatedBy: actor };
  }
  return {
    state: markStale({ ...state, elaboration: { ...state.elaboration, [path]: next } }),
    history,
  };
}

export function deleteChild(
  state: DealState,
  path: string,
  id: string,
  actor: string,
  now: string,
): { state: DealState; history: HistoryRow[] } {
  const children = state.elaboration[path] ?? [];
  const prior = children.find((c) => c.id === id);
  if (!prior) throw new StateError('no-child', `no child ${id} under ${path}`);
  const next = children.filter((c) => c.id !== id);
  const history: HistoryRow[] = [
    {
      scenario: 'likely',
      path: `${path}[${id}]`,
      priorValue: prior.amount,
      priorSource: prior.source,
      priorNote: prior.note,
      changedBy: actor,
      changedAt: now,
    },
  ];
  const elaboration = { ...state.elaboration };
  let inputs = state.inputs;
  if (next.length === 0) {
    delete elaboration[path];
    // The parent returns to an editable value equal to the last elaborated total, so outputs do not jump.
    const total = sumChildren(children);
    const value = parentValueFromAmount(state, path, total);
    const priorRec = state.inputs[path];
    if (priorRec)
      history.push({
        scenario: 'likely',
        path,
        priorValue: priorRec.value,
        priorSource: priorRec.source,
        priorNote: priorRec.note,
        changedBy: actor,
        changedAt: now,
      });
    inputs = {
      ...state.inputs,
      [path]: {
        value,
        source: 'calculated',
        note: 'Collapsed from elaborated children',
        updatedAt: now,
        updatedBy: actor,
        benchmarkId: priorRec?.benchmarkId ?? null,
      },
    };
  } else elaboration[path] = next;
  return { state: markStale({ ...state, elaboration, inputs }), history };
}

/** Convert an elaborated dollar total back into the parent's own unit. */
function parentValueFromAmount(state: DealState, path: string, amount: number): number {
  const inputs = toDealInputs({ ...state, elaboration: {} }, 'likely');
  if (path === 'costs.hard.perGrossSF') {
    const gsf = computeProgram(inputs).gsfTotal;
    return gsf > 0 ? amount / gsf : 0;
  }
  if (path === 'costs.soft.pctOfHard') {
    const hard = elaborationParentAmount(
      { ...state, elaboration: { ...state.elaboration, [path]: [] } },
      'costs.hard.perGrossSF',
    );
    return hard > 0 ? amount / hard : 0;
  }
  return amount;
}

/** Display value of an elaborated parent in its own unit (read-only while children exist, FR-2.1). */
export function elaboratedParentDisplayValue(state: DealState, path: string): number | null {
  const children = state.elaboration[path];
  if (!children || children.length === 0) return null;
  return parentValueFromAmount(state, path, sumChildren(children));
}

export function upsertEvent(
  state: DealState,
  event: Omit<DealEventRecord, keyof InputMeta | 'id'> & {
    id?: string;
    source?: Source;
    note?: string;
  },
  actor: string,
  now: string,
): { state: DealState; history: HistoryRow[] } {
  const id = event.id ?? newId('event', now);
  const prior = state.events.find((e) => e.id === id);
  const record: DealEventRecord = {
    id,
    label: event.label,
    month: event.month,
    amount: event.amount,
    kind: event.kind,
    category: event.kind === 'inflow' ? 'inflow' : event.category,
    source: event.source ?? prior?.source ?? 'my-number',
    note: event.note ?? prior?.note ?? '',
    updatedAt: now,
    updatedBy: actor,
    benchmarkId: null,
  };
  const history: HistoryRow[] = [
    {
      scenario: 'likely',
      path: `events[${id}]`,
      priorValue: prior
        ? {
            label: prior.label,
            month: prior.month,
            amount: prior.amount,
            kind: prior.kind,
            category: prior.category,
          }
        : null,
      priorSource: prior?.source ?? null,
      priorNote: prior?.note ?? null,
      changedBy: actor,
      changedAt: now,
    },
  ];
  const events = prior
    ? state.events.map((e) => (e.id === id ? record : e))
    : [...state.events, record];
  return { state: markStale({ ...state, events }), history };
}

export function deleteEvent(
  state: DealState,
  id: string,
  actor: string,
  now: string,
): { state: DealState; history: HistoryRow[] } {
  const prior = state.events.find((e) => e.id === id);
  if (!prior) throw new StateError('no-event', `no event ${id}`);
  return {
    state: markStale({ ...state, events: state.events.filter((e) => e.id !== id) }),
    history: [
      {
        scenario: 'likely',
        path: `events[${id}]`,
        priorValue: {
          label: prior.label,
          month: prior.month,
          amount: prior.amount,
          kind: prior.kind,
          category: prior.category,
        },
        priorSource: prior.source,
        priorNote: prior.note,
        changedBy: actor,
        changedAt: now,
      },
    ],
  };
}

export function saveSensitivity(
  state: DealState,
  entry: Omit<SavedSensitivity, 'id' | 'stale'> & { id?: string },
): DealState {
  const id = entry.id ?? newId('sens', entry.ranAt);
  const saved: SavedSensitivity = { ...entry, id, stale: false };
  const others = state.sensitivities.filter((s) => s.id !== id);
  return { ...state, sensitivities: [...others, saved] };
}

export function deleteSensitivity(state: DealState, id: string): DealState {
  return { ...state, sensitivities: state.sensitivities.filter((s) => s.id !== id) };
}

/** A clone keeps inputs, elaboration, events, switches and scenarios; history is reset by the caller (FR: "cloned from"). */
export function cloneState(
  state: DealState,
  fromDealName: string,
  actor: string,
  now: string,
): DealState {
  const restamp = <T extends InputMeta>(rec: T): T => ({
    ...rec,
    updatedAt: now,
    updatedBy: actor,
    note: rec.note ? `${rec.note} (cloned from ${fromDealName})` : `Cloned from ${fromDealName}`,
  });
  const inputs: Record<string, InputRecord> = {};
  for (const [p, r] of Object.entries(state.inputs)) inputs[p] = restamp(r);
  const elaboration: Record<string, ChildLine[]> = {};
  for (const [p, cs] of Object.entries(state.elaboration)) elaboration[p] = cs.map(restamp);
  const scen = (recs: Record<string, InputRecord>) =>
    Object.fromEntries(Object.entries(recs).map(([p, r]) => [p, restamp(r)]));
  return {
    ...state,
    inputs,
    elaboration,
    events: state.events.map(restamp),
    scenarios: { best: scen(state.scenarios.best), worst: scen(state.scenarios.worst) },
    sensitivities: [],
    assistantTranscript: [],
  };
}

/** History rows that record a clone: one per input, "cloned from <deal>" (spec 5). */
export function cloneHistory(
  state: DealState,
  fromDealName: string,
  actor: string,
  now: string,
): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const [path, rec] of Object.entries(state.inputs))
    rows.push({
      scenario: 'likely',
      path,
      priorValue: rec.value,
      priorSource: rec.source,
      priorNote: `cloned from ${fromDealName}`,
      changedBy: actor,
      changedAt: now,
    });
  return rows;
}

/** Every input path shown on the Inputs screen in order, with the switch-hidden ones filtered out. */
export function visibleInputPaths(state: DealState): string[] {
  const hidden = new Set<string>();
  for (const s of SWITCHES) if (!state.switches[s.key]) for (const p of s.inputs) hidden.add(p);
  return inputCatalog()
    .map((e) => e.path)
    .filter((p) => !SWITCH_PATHS.has(p) && !hidden.has(p));
}

/** The twelve "tonight" inputs (FR, spec 7.2 ★) shown first in Tonight mode. */
export function tonightPaths(): string[] {
  return inputCatalog()
    .filter((e) => e.star)
    .map((e) => e.path);
}

export function parseDealState(raw: unknown): DealState {
  const s = raw as Partial<DealState>;
  return {
    inputs: s.inputs ?? {},
    elaboration: s.elaboration ?? {},
    switches: { ...defaultSwitches(), ...(s.switches ?? {}) },
    events: s.events ?? [],
    scenarios: { best: s.scenarios?.best ?? {}, worst: s.scenarios?.worst ?? {} },
    sensitivities: s.sensitivities ?? [],
    packageSettings: {
      ...DEFAULT_PACKAGE_SETTINGS,
      ...(s.packageSettings ?? {}),
      pages: { ...DEFAULT_PACKAGE_SETTINGS.pages, ...(s.packageSettings?.pages ?? {}) },
    },
    assistantTranscript: s.assistantTranscript ?? [],
    setup: s.setup ?? {
      constructionType: 'wood-frame',
      townCluster: null,
      town: null,
      address: '',
      parcel: {
        lotSF: null,
        zoningDistrict: null,
        mbtaCommunitiesDistrict: null,
        assessedValue: null,
        annualTax: null,
        unitsByRight: null,
        lookupDate: null,
        notes: [],
      },
    },
  };
}
