/**
 * Typed queries behind the server actions (spec 11.4). Every deal query is organization-scoped;
 * state updates check the deal's `rev` and append history rows in the same transaction.
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from './client';
import * as t from './schema';
import { cloneHistory, cloneState, parseDealState, type DealState, type HistoryRow } from './state';

export class RevConflictError extends Error {
  readonly code = 'rev-conflict';
  constructor(
    readonly dealId: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`deal ${dealId} is at rev ${actual}, not ${expected}; reload before editing`);
    this.name = 'RevConflictError';
  }
}

export class NotFoundError extends Error {
  readonly code = 'not-found';
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  readonly code = 'forbidden';
  constructor(message = 'not a member of this organization') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export type Role = 'owner' | 'member' | 'reviewer';

export interface OrgSettings {
  defaultHoldMonths?: number;
  defaultWaterfall?: Array<{ hurdleIrrPct: number | null; lpSplit: number; gpSplit: number }>;
  rounding?: { usdThousandsFrom: number };
  scenarioDeltas?: { rentPct: number; hardCostPct: number };
  contributeBenchmarks?: boolean;
  letterheadName?: string;
  letterheadAddress?: string;
  /** A small PNG/SVG as a data URL (≤ 300 KB). */
  letterheadImage?: string;
}

// ---------- users and organizations ----------

export async function getUserByEmail(db: Db, email: string) {
  return db.query.users.findFirst({ where: eq(t.users.email, email.toLowerCase()) });
}

export async function upsertUser(db: Db, u: { email: string; name?: string | null; id?: string }) {
  const email = u.email.toLowerCase();
  const existing = await getUserByEmail(db, email);
  if (existing) return existing;
  const [row] = await db
    .insert(t.users)
    .values({ email, name: u.name ?? null, ...(u.id ? { id: u.id } : {}) })
    .returning();
  return row!;
}

/** The organizations a user belongs to, with roles. */
export async function listMemberships(db: Db, userId: string) {
  return db
    .select({ orgId: t.memberships.orgId, role: t.memberships.role, orgName: t.organizations.name, tier: t.organizations.tier, settings: t.organizations.settings })
    .from(t.memberships)
    .innerJoin(t.organizations, eq(t.organizations.id, t.memberships.orgId))
    .where(eq(t.memberships.userId, userId))
    .orderBy(asc(t.memberships.createdAt));
}

/** Every user owns a personal organization; created on first use. */
export async function ensureOrganization(db: Db, userId: string, displayName: string) {
  const existing = await listMemberships(db, userId);
  if (existing.length > 0) return existing[0]!;
  const [org] = await db
    .insert(t.organizations)
    .values({ name: `${displayName}'s organization`, settings: {} })
    .returning();
  await db.insert(t.memberships).values({ userId, orgId: org!.id, role: 'owner' });
  return { orgId: org!.id, role: 'owner', orgName: org!.name, tier: org!.tier, settings: org!.settings };
}

export async function requireMembership(db: Db, userId: string, orgId: string, roles?: Role[]) {
  const m = await db.query.memberships.findFirst({ where: and(eq(t.memberships.userId, userId), eq(t.memberships.orgId, orgId)) });
  if (!m) throw new ForbiddenError();
  if (roles && !roles.includes(m.role as Role)) throw new ForbiddenError(`requires role ${roles.join(' or ')}`);
  return m;
}

export async function getOrganization(db: Db, orgId: string) {
  const org = await db.query.organizations.findFirst({ where: eq(t.organizations.id, orgId) });
  if (!org) throw new NotFoundError('organization');
  return { ...org, settings: (org.settings ?? {}) as OrgSettings };
}

export async function updateOrganization(db: Db, orgId: string, changes: { name?: string; settings?: OrgSettings; letterheadKey?: string | null; tier?: string }) {
  const [row] = await db.update(t.organizations).set(changes).where(eq(t.organizations.id, orgId)).returning();
  if (!row) throw new NotFoundError('organization');
  return row;
}

export async function addMember(db: Db, orgId: string, userId: string, role: Role) {
  const [row] = await db
    .insert(t.memberships)
    .values({ orgId, userId, role })
    .onConflictDoUpdate({ target: [t.memberships.userId, t.memberships.orgId], set: { role } })
    .returning();
  return row!;
}

// ---------- deals ----------

export interface DealRow {
  id: string;
  orgId: string;
  name: string;
  address: Record<string, unknown>;
  town: string | null;
  isTemplate: boolean;
  clonedFrom: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  rev: number;
}

export async function listDeals(db: Db, orgId: string): Promise<DealRow[]> {
  const rows = await db.select().from(t.deals).where(eq(t.deals.orgId, orgId)).orderBy(desc(t.deals.updatedAt));
  return rows.map((r) => ({ ...r, address: (r.address ?? {}) as Record<string, unknown> }));
}

export async function getDeal(db: Db, orgId: string, dealId: string): Promise<{ deal: DealRow; state: DealState }> {
  const deal = await db.query.deals.findFirst({ where: and(eq(t.deals.id, dealId), eq(t.deals.orgId, orgId)) });
  if (!deal) throw new NotFoundError('deal');
  const state = await db.query.dealState.findFirst({ where: eq(t.dealState.dealId, dealId) });
  if (!state) throw new NotFoundError('deal state');
  return { deal: { ...deal, address: (deal.address ?? {}) as Record<string, unknown> }, state: parseDealState(stateFromRow(state)) };
}

function stateFromRow(row: typeof t.dealState.$inferSelect): DealState {
  return parseDealState({
    inputs: row.inputs,
    elaboration: row.elaboration,
    switches: row.switches,
    events: row.events,
    scenarios: row.scenarios,
    sensitivities: row.sensitivities,
    packageSettings: row.packageSettings,
    assistantTranscript: row.assistantTranscript,
    setup: row.setup,
  });
}

function stateToRow(state: DealState) {
  return {
    inputs: state.inputs,
    elaboration: state.elaboration,
    switches: state.switches,
    events: state.events,
    scenarios: state.scenarios,
    sensitivities: state.sensitivities,
    packageSettings: state.packageSettings,
    assistantTranscript: state.assistantTranscript,
    setup: state.setup,
  };
}

export async function createDeal(db: Db, args: { orgId: string; userId: string; name: string; address?: Record<string, unknown>; town?: string | null; state: DealState; clonedFrom?: string | null; history?: HistoryRow[] }) {
  return db.transaction(async (tx) => {
    const [deal] = await tx
      .insert(t.deals)
      .values({ orgId: args.orgId, name: args.name, address: args.address ?? {}, town: args.town ?? null, createdBy: args.userId, clonedFrom: args.clonedFrom ?? null })
      .returning();
    await tx.insert(t.dealState).values({ dealId: deal!.id, ...stateToRow(args.state) });
    // Creation itself is recorded as one row per input ("created with <source>") so the history is never empty.
    const created: HistoryRow[] = args.history ?? Object.entries(args.state.inputs).map(([path, rec]) => ({ scenario: 'likely', path, priorValue: rec.value, priorSource: rec.source, priorNote: `created (${rec.source})`, changedBy: args.userId, changedAt: rec.updatedAt }));
    if (created.length > 0) await tx.insert(t.inputHistory).values(created.map((h) => ({ dealId: deal!.id, ...h })));
    return { ...deal!, address: (deal!.address ?? {}) as Record<string, unknown> } as DealRow;
  });
}

/**
 * Apply a state mutation with optimistic concurrency: the caller passes the rev it last saw; the
 * mutation runs on the current state inside a transaction, history rows are appended, and rev is
 * incremented. A stale rev throws RevConflictError (no silent overwrite).
 */
export async function updateDealState(
  db: Db,
  args: { orgId: string; dealId: string; expectedRev: number; mutate: (state: DealState) => { state: DealState; history?: HistoryRow[] } | Promise<{ state: DealState; history?: HistoryRow[] }> },
): Promise<{ deal: DealRow; state: DealState; history: HistoryRow[] }> {
  return db.transaction(async (tx) => {
    const [deal] = await tx
      .select()
      .from(t.deals)
      .where(and(eq(t.deals.id, args.dealId), eq(t.deals.orgId, args.orgId)))
      .for('update');
    if (!deal) throw new NotFoundError('deal');
    if (deal.rev !== args.expectedRev) throw new RevConflictError(args.dealId, args.expectedRev, deal.rev);
    const row = await tx.query.dealState.findFirst({ where: eq(t.dealState.dealId, args.dealId) });
    if (!row) throw new NotFoundError('deal state');
    const current = stateFromRow(row);
    const result = await args.mutate(current);
    const history = result.history ?? [];
    await tx.update(t.dealState).set(stateToRow(result.state)).where(eq(t.dealState.dealId, args.dealId));
    const [updated] = await tx
      .update(t.deals)
      .set({ rev: deal.rev + 1, updatedAt: sql`now()` })
      .where(eq(t.deals.id, args.dealId))
      .returning();
    if (history.length > 0) await tx.insert(t.inputHistory).values(history.map((h) => ({ dealId: args.dealId, ...h })));
    return { deal: { ...updated!, address: (updated!.address ?? {}) as Record<string, unknown> }, state: result.state, history };
  });
}

export async function renameDeal(db: Db, orgId: string, dealId: string, name: string) {
  const [row] = await db
    .update(t.deals)
    .set({ name, updatedAt: sql`now()` })
    .where(and(eq(t.deals.id, dealId), eq(t.deals.orgId, orgId)))
    .returning();
  if (!row) throw new NotFoundError('deal');
  return row;
}

export async function markTemplate(db: Db, orgId: string, dealId: string, isTemplate: boolean) {
  const [row] = await db
    .update(t.deals)
    .set({ isTemplate })
    .where(and(eq(t.deals.id, dealId), eq(t.deals.orgId, orgId)))
    .returning();
  if (!row) throw new NotFoundError('deal');
  return row;
}

/** Deleting a deal cascades to its history, versions, files, shares and transcript (11.5). */
export async function deleteDeal(db: Db, orgId: string, dealId: string) {
  const deleted = await db
    .delete(t.deals)
    .where(and(eq(t.deals.id, dealId), eq(t.deals.orgId, orgId)))
    .returning({ id: t.deals.id });
  if (deleted.length === 0) throw new NotFoundError('deal');
}

export async function cloneDeal(db: Db, args: { orgId: string; userId: string; sourceDealId: string; name?: string; now?: string }) {
  const { deal, state } = await getDeal(db, args.orgId, args.sourceDealId);
  const now = args.now ?? new Date().toISOString();
  const cloned = cloneState(state, deal.name, args.userId, now);
  const history = cloneHistory(cloned, deal.name, args.userId, now);
  return createDeal(db, { orgId: args.orgId, userId: args.userId, name: args.name ?? `${deal.name} (copy)`, address: deal.address, town: deal.town, state: cloned, clonedFrom: deal.id, history });
}

export async function listHistory(db: Db, orgId: string, dealId: string, path?: string) {
  await getDealRow(db, orgId, dealId);
  const where = path ? and(eq(t.inputHistory.dealId, dealId), eq(t.inputHistory.path, path)) : eq(t.inputHistory.dealId, dealId);
  return db.select().from(t.inputHistory).where(where).orderBy(desc(t.inputHistory.changedAt), desc(t.inputHistory.createdAt));
}

async function getDealRow(db: Db, orgId: string, dealId: string) {
  const deal = await db.query.deals.findFirst({ where: and(eq(t.deals.id, dealId), eq(t.deals.orgId, orgId)) });
  if (!deal) throw new NotFoundError('deal');
  return deal;
}

// ---------- versions, files, shares ----------

export async function createVersion(db: Db, args: { orgId: string; dealId: string; userId: string; snapshot: DealState; outputs: unknown; engineVersion: string }) {
  return db.transaction(async (tx) => {
    const deal = await tx.query.deals.findFirst({ where: and(eq(t.deals.id, args.dealId), eq(t.deals.orgId, args.orgId)) });
    if (!deal) throw new NotFoundError('deal');
    const [last] = await tx.select({ n: sql<number>`coalesce(max(${t.versions.number}), 0)` }).from(t.versions).where(eq(t.versions.dealId, args.dealId));
    const number = Number(last?.n ?? 0) + 1;
    const [row] = await tx
      .insert(t.versions)
      .values({ dealId: args.dealId, number, snapshot: stateToRow(args.snapshot), outputs: args.outputs as object, engineVersion: args.engineVersion, createdBy: args.userId })
      .returning();
    return row!;
  });
}

export async function listVersions(db: Db, orgId: string, dealId: string) {
  await getDealRow(db, orgId, dealId);
  return db
    .select({ id: t.versions.id, number: t.versions.number, engineVersion: t.versions.engineVersion, createdBy: t.versions.createdBy, createdAt: t.versions.createdAt, reviewedBy: t.versions.reviewedBy, reviewedAt: t.versions.reviewedAt })
    .from(t.versions)
    .where(eq(t.versions.dealId, dealId))
    .orderBy(desc(t.versions.number));
}

export async function getVersion(db: Db, versionId: string) {
  const row = await db.query.versions.findFirst({ where: eq(t.versions.id, versionId) });
  if (!row) throw new NotFoundError('version');
  const deal = await db.query.deals.findFirst({ where: eq(t.deals.id, row.dealId) });
  if (!deal) throw new NotFoundError('deal');
  return { version: { ...row, snapshot: parseDealState(row.snapshot) }, deal: { ...deal, address: (deal.address ?? {}) as Record<string, unknown> } as DealRow };
}

export async function markReviewed(db: Db, versionId: string, reviewedBy: string) {
  const [row] = await db
    .update(t.versions)
    .set({ reviewedBy, reviewedAt: sql`now()` })
    .where(eq(t.versions.id, versionId))
    .returning();
  if (!row) throw new NotFoundError('version');
  return row;
}

export async function recordFile(db: Db, args: { versionId: string; kind: 'pdf' | 'xlsx'; storageKey: string; bytes: number }) {
  const [row] = await db.insert(t.files).values(args).returning();
  return row!;
}

export async function listFiles(db: Db, versionId: string) {
  return db.select().from(t.files).where(eq(t.files.versionId, versionId));
}

export async function createShare(db: Db, args: { versionId: string; userId: string; token: string; expiresAt?: string | null }) {
  const [row] = await db
    .insert(t.shares)
    .values({ versionId: args.versionId, createdBy: args.userId, token: args.token, expiresAt: args.expiresAt ?? null })
    .returning();
  return row!;
}

export async function revokeShare(db: Db, shareId: string) {
  const [row] = await db
    .update(t.shares)
    .set({ revokedAt: sql`now()` })
    .where(eq(t.shares.id, shareId))
    .returning();
  if (!row) throw new NotFoundError('share');
  return row;
}

export async function listShares(db: Db, dealId: string) {
  return db
    .select({ id: t.shares.id, versionId: t.shares.versionId, versionNumber: t.versions.number, token: t.shares.token, expiresAt: t.shares.expiresAt, revokedAt: t.shares.revokedAt, createdAt: t.shares.createdAt })
    .from(t.shares)
    .innerJoin(t.versions, eq(t.versions.id, t.shares.versionId))
    .where(eq(t.versions.dealId, dealId))
    .orderBy(desc(t.shares.createdAt));
}

/** Resolve a share token to its version; null when unknown, revoked or expired (FR-7.2). */
export async function resolveShare(db: Db, token: string, now = new Date()) {
  const share = await db.query.shares.findFirst({ where: eq(t.shares.token, token) });
  if (!share || share.revokedAt) return null;
  if (share.expiresAt && new Date(share.expiresAt).getTime() < now.getTime()) return null;
  const { version, deal } = await getVersion(db, share.versionId);
  const org = await getOrganization(db, deal.orgId);
  return { share, version, deal, org };
}

// ---------- benchmarks, towns, contributions, entitlements ----------

export async function seedBenchmarks(db: Db, rows: Array<typeof t.benchmarks.$inferInsert>) {
  if (rows.length === 0) return 0;
  await db
    .insert(t.benchmarks)
    .values(rows)
    .onConflictDoUpdate({ target: t.benchmarks.id, set: { low: sql`excluded.low`, mid: sql`excluded.mid`, high: sql`excluded.high`, asOf: sql`excluded.as_of`, source: sql`excluded.source`, sampleSize: sql`excluded.sample_size`, segment: sql`excluded.segment` } });
  return rows.length;
}

export async function listBenchmarks(db: Db) {
  return db.select().from(t.benchmarks);
}

export async function seedTowns(db: Db, rows: Array<typeof t.towns.$inferInsert>) {
  if (rows.length === 0) return 0;
  await db
    .insert(t.towns)
    .values(rows)
    .onConflictDoUpdate({ target: t.towns.town, set: { cluster: sql`excluded.cluster`, residentialTaxRate: sql`excluded.residential_tax_rate`, assessorUrl: sql`excluded.assessor_url`, mbtaStatus: sql`excluded.mbta_status` } });
  return rows.length;
}

export async function listTowns(db: Db) {
  return db.select().from(t.towns).orderBy(asc(t.towns.town));
}

export async function addContributions(db: Db, rows: Array<typeof t.contributions.$inferInsert>) {
  if (rows.length === 0) return 0;
  await db.insert(t.contributions).values(rows);
  return rows.length;
}

export async function listContributions(db: Db) {
  return db.select().from(t.contributions);
}

export async function listEntitlements(db: Db, orgId: string) {
  return db.select().from(t.entitlements).where(eq(t.entitlements.orgId, orgId));
}

export async function addEntitlement(db: Db, row: typeof t.entitlements.$inferInsert) {
  const [r] = await db.insert(t.entitlements).values(row).returning();
  return r!;
}
