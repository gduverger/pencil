/**
 * @pencil/benchmarks — the Massachusetts benchmark layer (spec 9): schema, CSV loader, segment
 * resolution, defaults and out-of-range flags. The table is seeded from a CSV (empty template
 * until Mark provides values) and grows through anonymized contributions (9.6, in @pencil/db).
 */
import { z } from 'zod';
import { catalogEntry, inputCatalog, type Flag, type Unit } from '@pencil/engine';

export const CONSTRUCTION_TYPES = ['wood-frame', 'podium', 'steel-concrete', 'modular'] as const;
export type ConstructionType = (typeof CONSTRUCTION_TYPES)[number];
export const PROJECT_SIZES = ['20-50', '51-150', '151-300'] as const;
export type ProjectSize = (typeof PROJECT_SIZES)[number];
export const TOWN_CLUSTERS = [
  'boston-core',
  'inner-suburbs',
  'outer-suburbs',
  'gateway-cities',
  'other-ma',
] as const;
export type TownCluster = (typeof TOWN_CLUSTERS)[number];

export const SegmentSchema = z.object({
  townCluster: z.enum(TOWN_CLUSTERS).optional(),
  constructionType: z.enum(CONSTRUCTION_TYPES).optional(),
  unitType: z.string().optional(),
  projectSize: z.enum(PROJECT_SIZES).optional(),
});
export type Segment = z.infer<typeof SegmentSchema>;

export const BenchmarkSchema = z.object({
  id: z.string(),
  metric: z.string(),
  segment: SegmentSchema,
  low: z.number(),
  mid: z.number(),
  high: z.number(),
  unit: z.string(),
  asOf: z.string(),
  source: z.string(),
  contributorOrgId: z.string().nullable().default(null),
  sampleSize: z.number().int().nullable().default(null),
});
export type Benchmark = z.infer<typeof BenchmarkSchema>;

/** A seed-template row: the segment is known but the range may be blank. */
export interface SeedRow {
  metric: string;
  segment: Segment;
  unit: string;
  low: number | null;
  mid: number | null;
  high: number | null;
  asOf: string;
  source: string;
  sampleSize: number | null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((x) => x !== '')) rows.push(row);
  }
  return rows;
}

/** Parse the seed CSV. Rows with blank ranges are returned with nulls (and are not benchmarks yet). */
export function parseSeedCsv(text: string): SeedRow[] {
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  const idx = (name: string) => header.indexOf(name);
  const num = (v: string | undefined) => (v === undefined || v.trim() === '' ? null : Number(v));
  return rows.slice(1).map((r) => {
    const get = (name: string) => r[idx(name)] ?? '';
    const segment: Segment = {};
    if (get('town_cluster')) segment.townCluster = get('town_cluster') as TownCluster;
    if (get('construction_type'))
      segment.constructionType = get('construction_type') as ConstructionType;
    if (get('unit_type')) segment.unitType = get('unit_type');
    if (get('project_size')) segment.projectSize = get('project_size') as ProjectSize;
    return {
      metric: get('metric'),
      segment,
      unit: get('unit'),
      low: num(get('low')),
      mid: num(get('mid')),
      high: num(get('high')),
      asOf: get('as_of'),
      source: get('source'),
      sampleSize: num(get('sample_size')) === null ? null : Math.round(num(get('sample_size'))!),
    };
  });
}

/** Seed rows with a complete range become benchmarks; blank rows are skipped (schema defaults apply). */
export function benchmarksFromSeed(rows: SeedRow[], idPrefix = 'seed'): Benchmark[] {
  const out: Benchmark[] = [];
  rows.forEach((r, i) => {
    if (r.low === null || r.mid === null || r.high === null) return;
    out.push(
      BenchmarkSchema.parse({
        id: `${idPrefix}-${i + 1}`,
        metric: r.metric,
        segment: r.segment,
        low: r.low,
        mid: r.mid,
        high: r.high,
        unit: r.unit,
        asOf: r.asOf,
        source: r.source,
        contributorOrgId: null,
        sampleSize: r.sampleSize,
      }),
    );
  });
  return out;
}

export function loadBenchmarksCsv(text: string): Benchmark[] {
  return benchmarksFromSeed(parseSeedCsv(text));
}

/** Project size bucket from total units (9.1). */
export function projectSizeOf(totalUnits: number): ProjectSize {
  if (totalUnits <= 50) return '20-50';
  if (totalUnits <= 150) return '51-150';
  return '151-300';
}

/** Does a benchmark's segment apply to a deal's segment? Every key the benchmark sets must match. */
export function segmentMatches(benchmark: Segment, deal: Segment): boolean {
  for (const key of ['townCluster', 'constructionType', 'unitType', 'projectSize'] as const) {
    const b = benchmark[key];
    if (b !== undefined && b !== deal[key]) return false;
  }
  return true;
}

export function specificity(segment: Segment): number {
  return ['townCluster', 'constructionType', 'unitType', 'projectSize'].filter(
    (k) => segment[k as keyof Segment] !== undefined,
  ).length;
}

/** The deal segment for one metric: a unit-type path (`program.unitTypes[2BR].…`) implies its unit type. */
export function segmentForPath(deal: Segment, path: string): Segment {
  const m = path.match(/^program\.unitTypes\[([^\]]+)\]/);
  return m ? { ...deal, unitType: m[1] } : deal;
}

/**
 * The most specific benchmark for a metric and deal segment (9.3), falling back to less specific
 * segments. Ties go to the most recent `asOf`, then to larger samples, then to seed rows.
 */
export function resolveBenchmark(
  benchmarks: readonly Benchmark[],
  metric: string,
  dealSegment: Segment,
): Benchmark | undefined {
  const deal = segmentForPath(dealSegment, metric);
  const candidates = benchmarks.filter(
    (b) => b.metric === metric && segmentMatches(b.segment, deal),
  );
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((a, b) => {
    const s = specificity(b.segment) - specificity(a.segment);
    if (s !== 0) return s;
    if (a.asOf !== b.asOf) return a.asOf < b.asOf ? 1 : -1;
    const n = (b.sampleSize ?? 0) - (a.sampleSize ?? 0);
    if (n !== 0) return n;
    if ((a.contributorOrgId === null) !== (b.contributorOrgId === null))
      return a.contributorOrgId === null ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  })[0];
}

export interface ResolvedDefault {
  path: string;
  value: unknown;
  unit: Unit;
  source: 'benchmark' | 'unknown';
  benchmarkId: string | null;
  note: string;
}

/**
 * Defaults for every catalogued input: the resolved benchmark's `mid` when one exists, otherwise
 * the schema default with source `unknown` (14.2 — see docs/decisions.md).
 */
export function resolveDefaults(
  benchmarks: readonly Benchmark[],
  deal: Segment,
): ResolvedDefault[] {
  return inputCatalog().map((entry) => {
    const b = resolveBenchmark(benchmarks, entry.path, deal);
    if (b) {
      return {
        path: entry.path,
        value: b.mid,
        unit: entry.unit,
        source: 'benchmark',
        benchmarkId: b.id,
        note: `Benchmark mid for ${describeSegment(b.segment)} (${b.source}, ${b.asOf})`,
      };
    }
    return {
      path: entry.path,
      value: entry.default,
      unit: entry.unit,
      source: 'unknown',
      benchmarkId: null,
      note: 'Schema default; no benchmark seeded for this segment',
    };
  });
}

export function describeSegment(s: Segment): string {
  const parts = [
    s.townCluster,
    s.constructionType,
    s.unitType,
    s.projectSize ? `${s.projectSize} units` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'all segments';
}

export interface BenchmarkCheck {
  path: string;
  benchmark: Benchmark;
  value: number;
  inRange: boolean;
  flag: Flag | null;
}

/** Flag `{ path, code: 'outside-benchmark', message }` when a value is outside [low, high] (9.4). */
export function checkAgainstBenchmark(
  path: string,
  value: unknown,
  benchmark: Benchmark | undefined,
): BenchmarkCheck | null {
  if (!benchmark || typeof value !== 'number') return null;
  const inRange = value >= benchmark.low && value <= benchmark.high;
  const label = catalogEntry(path)?.label ?? path;
  const fmt = (v: number) => formatForUnit(v, benchmark.unit);
  const flag: Flag | null = inRange
    ? null
    : {
        path,
        code: 'outside-benchmark',
        message: `${label} of ${fmt(value)} is ${value < benchmark.low ? 'below' : 'above'} the ${fmt(benchmark.low)}–${fmt(benchmark.high)} range for ${describeSegment(benchmark.segment)} as of ${benchmark.asOf}`,
      };
  return { path, benchmark, value, inRange, flag };
}

/** Check every numeric value in a path→value map against the resolved benchmarks. */
export function flagsForValues(
  benchmarks: readonly Benchmark[],
  deal: Segment,
  values: Record<string, unknown>,
): Flag[] {
  const flags: Flag[] = [];
  for (const [path, value] of Object.entries(values)) {
    const check = checkAgainstBenchmark(path, value, resolveBenchmark(benchmarks, path, deal));
    if (check?.flag) flags.push(check.flag);
  }
  return flags;
}

function formatForUnit(v: number, unit: string): string {
  switch (unit) {
    case 'usd':
    case 'usd_per_unit':
    case 'usd_per_unit_month':
      return `$${Math.round(v).toLocaleString('en-US')}`;
    case 'usd_per_sf':
      return `$${v.toFixed(2)}`;
    case 'pct':
    case 'rate_pct':
      return `${(v * 100).toFixed(2)}%`;
    default:
      return String(v);
  }
}

/** 25th / 50th / 75th percentiles (linear interpolation), for contributed ranges (9.6). */
export function percentiles(
  values: readonly number[],
): { p25: number; p50: number; p75: number } | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => {
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
  };
  return { p25: at(0.25), p50: at(0.5), p75: at(0.75) };
}

/** The metrics a contribution covers: the seed list of 9.2 as catalogued paths. */
export function contributionMetrics(): string[] {
  const seedMetrics = new Set<string>();
  for (const e of inputCatalog()) {
    if (
      e.path.startsWith('costs.hard.') ||
      e.path.startsWith('costs.soft.') ||
      e.path.startsWith('program.unitTypes[') ||
      e.path === 'program.otherIncomePerUnitMonth' ||
      e.path.startsWith('operations.') ||
      e.path.startsWith('timeline.') ||
      e.path.startsWith('financing.constructionLoan.') ||
      e.path.startsWith('financing.permanent.') ||
      e.path.startsWith('exit.') ||
      e.path === 'costs.developerFeePct' ||
      e.path === 'site.closingCostPct'
    ) {
      if (e.unit !== 'flag' && e.unit !== 'text') seedMetrics.add(e.path);
    }
  }
  return [...seedMetrics];
}
