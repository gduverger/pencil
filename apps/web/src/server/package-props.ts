/** Build PackageProps (spec 8) from a deal state: register with sources, benchmarks, flags, overrides; sensitivities; site facts. */
import { projectSizeOf, resolveBenchmark, type Benchmark, type Segment } from '@pencil/benchmarks';
import { SECTION_LABELS, type PackageProps, type RegisterEntry, type SensitivityEntry, type VersionMeta } from '@pencil/package-pages';
import { catalogEntry, inputCatalog, type DealOutputs, type ScenarioKey } from '@pencil/engine';
import { visibleInputPaths, type DealState } from '@pencil/db/state';
import { listBenchmarks, type Db, type OrgSettings } from '@pencil/db';

export async function loadBenchmarks(db: Db): Promise<Benchmark[]> {
  const rows = await listBenchmarks(db);
  return rows.map((b) => ({ id: b.id, metric: b.metric, segment: b.segment as Segment, low: b.low, mid: b.mid, high: b.high, unit: b.unit, asOf: b.asOf, source: b.source, contributorOrgId: b.contributorOrgId ?? null, sampleSize: b.sampleSize ?? null }));
}

export function segmentOf(state: DealState): Segment {
  const units = state.inputs['program.totalUnits']?.value;
  return { constructionType: state.setup.constructionType, projectSize: projectSizeOf(typeof units === 'number' ? units : 60), ...(state.setup.townCluster ? { townCluster: state.setup.townCluster } : {}) };
}

export function buildRegister(state: DealState, benchmarks: readonly Benchmark[]): RegisterEntry[] {
  const segment = segmentOf(state);
  const entries: RegisterEntry[] = [];
  for (const path of visibleInputPaths(state)) {
    const rec = state.inputs[path];
    const meta = catalogEntry(path);
    if (!rec || !meta) continue;
    const children = state.elaboration[path];
    const b = resolveBenchmark(benchmarks, path, segment);
    const value = children && children.length > 0 ? children.reduce((s, c) => s + c.amount, 0) : rec.value;
    const unit = children && children.length > 0 && (path === 'costs.hard.perGrossSF' || path === 'costs.soft.pctOfHard') ? 'usd' : meta.unit;
    const flagged = b && typeof rec.value === 'number' && !(children && children.length > 0) ? rec.value < b.low || rec.value > b.high : false;
    const overrides: RegisterEntry['overrides'] = {};
    const best = state.scenarios.best[path];
    const worst = state.scenarios.worst[path];
    if (best) overrides.best = best.value;
    if (worst) overrides.worst = worst.value;
    entries.push({
      path,
      section: SECTION_LABELS[path.split('.')[0] ?? ''] ?? path.split('.')[0] ?? '',
      label: children && children.length > 0 ? `${meta.label} (sum of ${children.length} lines)` : meta.label,
      unit,
      value,
      source: rec.source,
      ...(rec.note ? { note: rec.note } : {}),
      updatedAt: rec.updatedAt,
      updatedBy: rec.updatedBy,
      ...(b ? { benchmark: { low: b.low, mid: b.mid, high: b.high, asOf: b.asOf, source: b.source, ...(b.sampleSize ? { sampleSize: b.sampleSize } : {}) } } : {}),
      ...(flagged && b ? { flag: `Outside the ${b.low}–${b.high} range for ${b.source}, ${b.asOf}` } : {}),
      ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
    });
    if (children && children.length > 0) {
      for (const c of children) {
        entries.push({ path: `${path}[${c.id}]`, section: entries[entries.length - 1]!.section, label: `  ↳ ${c.label}`, unit, value: c.amount, source: c.source, ...(c.note ? { note: c.note } : {}), updatedAt: c.updatedAt, updatedBy: c.updatedBy });
      }
    }
  }
  for (const ev of state.events) {
    entries.push({ path: `events[${ev.id}]`, section: 'Events', label: `${ev.label} (${ev.kind}, ${ev.category}, month ${ev.month})`, unit: 'usd', value: ev.amount, source: ev.source, ...(ev.note ? { note: ev.note } : {}), updatedAt: ev.updatedAt, updatedBy: ev.updatedBy });
  }
  return entries;
}

export function sensitivityEntries(state: DealState): SensitivityEntry[] {
  return state.sensitivities.map((s) => ({ key: s.key, label: s.label, grid: s.grid, stale: s.stale, scenario: s.scenario }));
}

export function buildPackageProps(args: { state: DealState; outputs: Record<ScenarioKey, DealOutputs>; version: VersionMeta; org: { name: string; settings: OrgSettings }; benchmarks: readonly Benchmark[] }): PackageProps {
  const { state, org } = args;
  const letterhead = org.settings.letterheadName || org.settings.letterheadImage ? { orgName: org.settings.letterheadName ?? org.name, ...(org.settings.letterheadAddress ? { address: org.settings.letterheadAddress } : {}), ...(org.settings.letterheadImage ? { imageUrl: org.settings.letterheadImage } : {}) } : { orgName: org.name };
  return {
    outputs: args.outputs,
    version: args.version,
    letterhead,
    register: buildRegister(state, args.benchmarks),
    sensitivities: sensitivityEntries(state),
    settings: state.packageSettings,
    site: {
      address: state.setup.address,
      ...(state.setup.town ? { town: state.setup.town } : {}),
      ...(state.setup.townCluster ? { townCluster: state.setup.townCluster } : {}),
      ...(state.setup.parcel.lotSF !== null ? { lotSF: state.setup.parcel.lotSF } : {}),
      ...(state.setup.parcel.zoningDistrict ? { zoningDistrict: state.setup.parcel.zoningDistrict } : {}),
      ...(state.setup.parcel.mbtaCommunitiesDistrict !== null ? { mbtaCommunitiesDistrict: state.setup.parcel.mbtaCommunitiesDistrict } : {}),
      ...(state.setup.parcel.assessedValue !== null ? { assessedValue: state.setup.parcel.assessedValue } : {}),
      ...(state.setup.parcel.annualTax !== null ? { annualTax: state.setup.parcel.annualTax } : {}),
    },
  };
}

/** Changed inputs and headline metrics between two snapshots (FR-7.5). */
export interface DiffRow {
  path: string;
  label: string;
  old: unknown;
  new: unknown;
  oldNote: string;
  newNote: string;
  who: string;
  when: string;
  scenario: 'likely' | 'best' | 'worst';
}

export function diffStates(a: DealState, b: DealState): DiffRow[] {
  const rows: DiffRow[] = [];
  const compare = (scenario: 'likely' | 'best' | 'worst', ra: Record<string, { value: unknown; note: string; updatedBy: string; updatedAt: string }>, rb: typeof ra) => {
    for (const path of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
      const x = ra[path];
      const y = rb[path];
      if (JSON.stringify(x?.value) === JSON.stringify(y?.value) && (x?.note ?? '') === (y?.note ?? '')) continue;
      rows.push({ path, label: catalogEntry(path)?.label ?? path, old: x?.value, new: y?.value, oldNote: x?.note ?? '', newNote: y?.note ?? '', who: y?.updatedBy ?? x?.updatedBy ?? '', when: y?.updatedAt ?? x?.updatedAt ?? '', scenario });
    }
  };
  compare('likely', a.inputs, b.inputs);
  compare('best', a.scenarios.best, b.scenarios.best);
  compare('worst', a.scenarios.worst, b.scenarios.worst);
  for (const path of new Set([...Object.keys(a.elaboration), ...Object.keys(b.elaboration)])) {
    const sa = (a.elaboration[path] ?? []).map((c) => `${c.label}:${c.amount}`).join('|');
    const sb = (b.elaboration[path] ?? []).map((c) => `${c.label}:${c.amount}`).join('|');
    if (sa !== sb) rows.push({ path: `${path} (children)`, label: `${catalogEntry(path)?.label ?? path} — elaboration`, old: sa || '—', new: sb || '—', oldNote: '', newNote: '', who: '', when: '', scenario: 'likely' });
  }
  const ea = a.events.map((e) => `${e.label} m${e.month} ${e.amount} ${e.kind}`).join('|');
  const eb = b.events.map((e) => `${e.label} m${e.month} ${e.amount} ${e.kind}`).join('|');
  if (ea !== eb) rows.push({ path: 'events', label: 'Events', old: ea || '—', new: eb || '—', oldNote: '', newNote: '', who: '', when: '', scenario: 'likely' });
  for (const k of Object.keys(a.switches) as Array<keyof typeof a.switches>) {
    if (a.switches[k] !== b.switches[k]) rows.push({ path: `switch:${k}`, label: `Switch ${k}`, old: a.switches[k] ? 'on' : 'off', new: b.switches[k] ? 'on' : 'off', oldNote: '', newNote: '', who: '', when: '', scenario: 'likely' });
  }
  return rows;
}

export const HEADLINE_METRICS = ['projectIrr', 'lpIrr', 'gpIrr', 'unleveredIrr', 'equityMultiple', 'yieldOnCost', 'totalProjectCost', 'costPerUnit', 'saleValue', 'profit'] as const;

export function inputCatalogLabels(): Record<string, string> {
  return Object.fromEntries(inputCatalog().map((e) => [e.path, e.label]));
}
