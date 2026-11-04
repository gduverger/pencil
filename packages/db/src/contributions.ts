/**
 * Opt-in anonymized benchmark contributions and the nightly percentile recompute (spec 9.6).
 *
 * On export, an organization that opted in contributes its deal's resolved values for the
 * seed-list metrics: metric, segment keys, value and the export month — never an address, a name,
 * a note or any free text. Nightly, contributed ranges are recomputed as the 25th/50th/75th
 * percentiles once a segment has at least five contributions from at least three organizations;
 * seed ranges remain until then.
 */
import { and, eq, like, sql } from 'drizzle-orm';
import { contributionMetrics, percentiles, projectSizeOf, segmentForPath, type Segment } from '@pencil/benchmarks';
import { catalogEntry } from '@pencil/engine';
import type { Db } from './client';
import * as t from './schema';
import type { DealState } from './state';

export interface ContributionRow {
  orgId: string;
  metric: string;
  segment: Segment;
  value: number;
  exportedMonth: string;
}

export const MIN_CONTRIBUTIONS = 5;
export const MIN_ORGANIZATIONS = 3;

/** The anonymized rows for one deal state. Only numeric seed-list metrics with a value are included. */
export function buildContributions(state: DealState, orgId: string, exportedMonth: string): ContributionRow[] {
  const units = state.inputs['program.totalUnits']?.value;
  const base: Segment = { constructionType: state.setup.constructionType, projectSize: projectSizeOf(typeof units === 'number' ? units : 60), ...(state.setup.townCluster ? { townCluster: state.setup.townCluster } : {}) };
  const rows: ContributionRow[] = [];
  for (const metric of contributionMetrics()) {
    const rec = state.inputs[metric];
    const children = state.elaboration[metric];
    let value: unknown = rec?.value;
    if (children && children.length > 0 && metric !== 'costs.hard.perGrossSF' && metric !== 'costs.soft.pctOfHard') value = children.reduce((s, c) => s + c.amount, 0);
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    // Switch-hidden inputs are not contributed.
    if (metric.startsWith('financing.permanent.') && !state.switches.permanent) continue;
    if (metric.startsWith('program.commercial.')) continue;
    rows.push({ orgId, metric, segment: segmentForPath(base, metric), value, exportedMonth });
  }
  return rows;
}

export async function recordContributions(db: Db, rows: ContributionRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  await db.insert(t.contributions).values(rows.map((r) => ({ orgId: r.orgId, metric: r.metric, segment: r.segment, value: r.value, exportedMonth: r.exportedMonth })));
  return rows.length;
}

function segmentKey(segment: Segment): string {
  return ['townCluster', 'constructionType', 'unitType', 'projectSize']
    .map((k) => `${k}=${(segment as Record<string, string | undefined>)[k] ?? ''}`)
    .join(';');
}

export interface RecomputeResult {
  segmentsSeen: number;
  rangesWritten: number;
  written: Array<{ id: string; metric: string; segment: Segment; low: number; mid: number; high: number; sampleSize: number; organizations: number }>;
}

/** The nightly job: aggregate contributions into benchmark rows (`contrib:` ids) per metric and segment. */
export async function recomputeContributedBenchmarks(db: Db, asOf: string): Promise<RecomputeResult> {
  const all = await db.select().from(t.contributions);
  const groups = new Map<string, { metric: string; segment: Segment; values: number[]; orgs: Set<string> }>();
  for (const c of all) {
    const segment = (c.segment ?? {}) as Segment;
    const key = `${c.metric}|${segmentKey(segment)}`;
    const g = groups.get(key) ?? { metric: c.metric, segment, values: [], orgs: new Set<string>() };
    g.values.push(c.value);
    g.orgs.add(c.orgId);
    groups.set(key, g);
  }
  const result: RecomputeResult = { segmentsSeen: groups.size, rangesWritten: 0, written: [] };
  for (const [key, g] of groups) {
    if (g.values.length < MIN_CONTRIBUTIONS || g.orgs.size < MIN_ORGANIZATIONS) continue;
    const p = percentiles(g.values);
    if (!p) continue;
    const id = `contrib:${key}`;
    const unit = catalogEntry(g.metric)?.unit ?? 'usd';
    const row = { id, metric: g.metric, segment: g.segment, low: p.p25, mid: p.p50, high: p.p75, unit, asOf, source: `Contributed — ${g.values.length} deals from ${g.orgs.size} organizations`, contributorOrgId: null, sampleSize: g.values.length };
    await db
      .insert(t.benchmarks)
      .values(row)
      .onConflictDoUpdate({ target: t.benchmarks.id, set: { low: row.low, mid: row.mid, high: row.high, asOf: row.asOf, source: row.source, sampleSize: row.sampleSize, segment: row.segment } });
    result.rangesWritten += 1;
    result.written.push({ id, metric: g.metric, segment: g.segment, low: p.p25, mid: p.p50, high: p.p75, sampleSize: g.values.length, organizations: g.orgs.size });
  }
  return result;
}

export async function listContributedBenchmarks(db: Db) {
  return db.select().from(t.benchmarks).where(like(t.benchmarks.id, 'contrib:%'));
}

export async function countContributions(db: Db, orgId?: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(t.contributions)
    .where(orgId ? and(eq(t.contributions.orgId, orgId)) : undefined);
  return Number(row?.n ?? 0);
}
