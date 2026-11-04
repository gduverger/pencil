'use server';

/**
 * Server actions: the API surface of spec 11.4. Every action checks organization membership;
 * state changes carry the client's `rev` so a concurrent edit returns a conflict, never a silent
 * overwrite. Engine runs for the Version happen here on the server.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  addChild as addChildState,
  applyPatches,
  cloneDeal as cloneDealQuery,
  createDeal as createDealQuery,
  deleteChild as deleteChildState,
  deleteDeal as deleteDealQuery,
  deleteEvent as deleteEventState,
  deleteSensitivity as deleteSensitivityState,
  getDeal,
  listBenchmarks,
  listHistory as listHistoryQuery,
  markTemplate as markTemplateQuery,
  renameDeal as renameDealQuery,
  requireMembership,
  RevConflictError,
  saveSensitivity as saveSensitivityState,
  setSwitch as setSwitchState,
  StateError,
  toDealInputs,
  updateDealState,
  updateChild as updateChildState,
  updateOrganization,
  upsertEvent as upsertEventState,
  type DealState,
  type HistoryRow,
  type InputPatch,
  type OrgSettings,
  type SwitchKey,
} from '@pencil/db';
import { sensitivity, type Axis, type MetricKey, type ScenarioKey } from '@pencil/engine';
import type { ConstructionType } from '@pencil/benchmarks';
import type { Distribution, Source } from '@pencil/engine';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { buildNewDeal } from './deal-setup';
import { headers } from 'next/headers';
import { createShare as createShareHelper, createVersion as createVersionHelper, exportFile as exportFileHelper, fileDownloadUrl } from './package';
import { diffStates, HEADLINE_METRICS } from './package-props';
import { getVersion, listShares as listSharesQuery, listVersions as listVersionsQuery, markReviewed as markReviewedQuery, revokeShare as revokeShareQuery, listEntitlements } from '@pencil/db';
import type { DealOutputs } from '@pencil/engine';
import { hasEntitlement } from '@/lib/entitlements';
import type { PackageSettings } from '@pencil/package-pages';

export type ActionResult<T = undefined> = { ok: true; rev: number; data?: T } | { ok: false; code: string; message: string; rev?: number };

async function mutate<T = undefined>(dealId: string, rev: number, fn: (state: DealState, actor: string, now: string) => { state: DealState; history?: HistoryRow[]; data?: T }, paths: string[] = []): Promise<ActionResult<T>> {
  const user = await requireUser();
  const db = await getDb();
  const now = new Date().toISOString();
  let data: T | undefined;
  try {
    const r = await updateDealState(db, {
      orgId: user.orgId,
      dealId,
      expectedRev: rev,
      mutate: (state) => {
        const out = fn(state, user.id, now);
        data = out.data;
        return out;
      },
    });
    for (const p of paths) revalidatePath(p);
    revalidatePath(`/deals/${dealId}/inputs`);
    return { ok: true, rev: r.deal.rev, data };
  } catch (e) {
    if (e instanceof RevConflictError) return { ok: false, code: 'rev-conflict', message: e.message, rev: e.actual };
    if (e instanceof StateError) return { ok: false, code: e.code, message: e.message };
    const err = e as { code?: string; message?: string };
    return { ok: false, code: err.code ?? 'error', message: err.message ?? 'The change could not be saved.' };
  }
}

export async function createDealFromAddress(input: { name?: string; address: string; constructionType: ConstructionType; totalUnits?: number; landOwned?: boolean; landCost?: number }) {
  const user = await requireUser();
  const db = await getDb();
  const benchmarks = (await listBenchmarks(db)).map((b) => ({ ...b, segment: b.segment as Record<string, string>, contributorOrgId: b.contributorOrgId ?? null, sampleSize: b.sampleSize ?? null }));
  const { name, state } = buildNewDeal(input, benchmarks, user.id, new Date().toISOString());
  const deal = await createDealQuery(db, { orgId: user.orgId, userId: user.id, name, address: { raw: input.address, town: state.setup.town }, town: state.setup.town, state });
  revalidatePath('/deals');
  redirect(`/deals/${deal.id}/inputs`);
}

export async function cloneDeal(sourceDealId: string, name?: string) {
  const user = await requireUser();
  const db = await getDb();
  const deal = await cloneDealQuery(db, { orgId: user.orgId, userId: user.id, sourceDealId, ...(name ? { name } : {}) });
  revalidatePath('/deals');
  redirect(`/deals/${deal.id}/inputs`);
}

export async function createFromTemplate(templateDealId: string, name: string) {
  return cloneDeal(templateDealId, name);
}

export async function renameDeal(dealId: string, name: string) {
  const user = await requireUser();
  const db = await getDb();
  await renameDealQuery(db, user.orgId, dealId, name.trim() || 'Untitled deal');
  revalidatePath('/deals');
  revalidatePath(`/deals/${dealId}/setup`);
}

export async function markTemplate(dealId: string, isTemplate: boolean) {
  const user = await requireUser();
  const db = await getDb();
  await requireMembership(db, user.id, user.orgId, ['owner']);
  await markTemplateQuery(db, user.orgId, dealId, isTemplate);
  revalidatePath('/deals');
}

export async function deleteDeal(dealId: string) {
  const user = await requireUser();
  const db = await getDb();
  await deleteDealQuery(db, user.orgId, dealId);
  revalidatePath('/deals');
  redirect('/deals');
}

export async function updateInputs(dealId: string, rev: number, patches: InputPatch[]) {
  return mutate(dealId, rev, (state, actor, now) => applyPatches(state, patches, actor, now));
}

export async function setSwitch(dealId: string, rev: number, key: SwitchKey, on: boolean, values?: Record<string, { value: unknown; source?: Source; note?: string }>) {
  return mutate(dealId, rev, (state, actor, now) => setSwitchState(state, key, on, actor, now, values));
}

export async function addChild(dealId: string, rev: number, path: string, child: { label: string; amount: number; source?: Source; note?: string; distribution?: Distribution }) {
  return mutate(dealId, rev, (state, actor, now) => addChildState(state, path, child, actor, now));
}

export async function updateChild(dealId: string, rev: number, path: string, id: string, changes: { label?: string; amount?: number; source?: Source; note?: string; distribution?: Distribution }) {
  return mutate(dealId, rev, (state, actor, now) => updateChildState(state, path, id, changes, actor, now));
}

export async function deleteChild(dealId: string, rev: number, path: string, id: string) {
  return mutate(dealId, rev, (state, actor, now) => deleteChildState(state, path, id, actor, now));
}

export async function upsertEvent(dealId: string, rev: number, event: { id?: string; label: string; month: number; amount: number; kind: 'cost' | 'inflow'; category: 'land' | 'hard' | 'soft' | 'other' | 'inflow'; source?: Source; note?: string }) {
  return mutate(dealId, rev, (state, actor, now) => upsertEventState(state, event, actor, now));
}

export async function deleteEvent(dealId: string, rev: number, id: string) {
  return mutate(dealId, rev, (state, actor, now) => deleteEventState(state, id, actor, now));
}

export async function runSensitivity(dealId: string, rev: number, spec: { key: string; label: string; scenario: ScenarioKey; axisA: Axis; axisB: Axis; metrics: MetricKey[]; id?: string }) {
  return mutate(dealId, rev, (state, actor, now) => {
    const base = toDealInputs(state, 'likely');
    const overrides = spec.scenario === 'likely' ? {} : Object.fromEntries(Object.entries(state.scenarios[spec.scenario]).map(([p, r]) => [p, r.value]));
    const grid = sensitivity(base, overrides, spec.axisA, spec.axisB, spec.metrics);
    const next = saveSensitivityState(state, { ...(spec.id ? { id: spec.id } : {}), key: spec.key, label: spec.label, scenario: spec.scenario, axisA: spec.axisA, axisB: spec.axisB, metrics: spec.metrics, grid, ranAt: now, ranBy: actor });
    return { state: next, history: [] };
  }, [`/deals/${dealId}/results`]);
}

export async function deleteSensitivity(dealId: string, rev: number, id: string) {
  return mutate(dealId, rev, (state) => ({ state: deleteSensitivityState(state, id), history: [] }), [`/deals/${dealId}/results`]);
}

/** The current state and rev for a client that needs to resync (after a server-side sensitivity run). */
export async function getDealStateForResults(dealId: string): Promise<{ state: DealState; rev: number } | null> {
  const user = await requireUser();
  const db = await getDb();
  try {
    const { deal, state } = await getDeal(db, user.orgId, dealId);
    return { state, rev: deal.rev };
  } catch {
    return null;
  }
}

export async function listHistory(dealId: string, path?: string) {
  const user = await requireUser();
  const db = await getDb();
  const rows = await listHistoryQuery(db, user.orgId, dealId, path);
  return rows.map((r) => ({ id: r.id, scenario: r.scenario, path: r.path, priorValue: r.priorValue, priorSource: r.priorSource, priorNote: r.priorNote, changedBy: r.changedBy, changedAt: r.changedAt }));
}

export async function updateOrgSettings(changes: { name?: string; settings?: OrgSettings }) {
  const user = await requireUser();
  const db = await getDb();
  await requireMembership(db, user.id, user.orgId, ['owner']);
  await updateOrganization(db, user.orgId, { ...(changes.name ? { name: changes.name } : {}), ...(changes.settings ? { settings: { ...user.settings, ...changes.settings } } : {}) });
  revalidatePath('/settings');
  revalidatePath('/', 'layout');
}


// ---------- package settings, versions, exports, shares, diff (FR-7) ----------

export async function updatePackageSettings(dealId: string, rev: number, settings: Partial<PackageSettings>) {
  return mutate(dealId, rev, (state) => ({ state: { ...state, packageSettings: { ...state.packageSettings, ...settings, pages: { ...state.packageSettings.pages, ...(settings.pages ?? {}) } } }, history: [] }), [`/deals/${dealId}/package`]);
}

async function baseUrl(): Promise<string> {
  if (process.env.PENCIL_BASE_URL) return process.env.PENCIL_BASE_URL;
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '127.0.0.1:3000';
  return `${proto}://${host}`;
}

async function requireExportEntitlement(dealId: string) {
  const user = await requireUser();
  const db = await getDb();
  const entitlements = await listEntitlements(db, user.orgId);
  if (!hasEntitlement(user.tier, entitlements, dealId)) {
    return { ok: false as const, code: 'entitlement', message: 'Exports and share links need a Per-deal purchase or a Pro subscription.', user, db };
  }
  return { ok: true as const, user, db };
}

export type ExportResult = { ok: true; versionId: string; versionNumber: number; fileId: string; name: string; url: string; bytes: number } | { ok: false; code: string; message: string };

/** Export creates a Version (frozen inputs, outputs, settings) and the file (FR-7.1, FR-7.4). */
export async function exportVersion(dealId: string, kind: 'pdf' | 'xlsx'): Promise<ExportResult> {
  const gate = await requireExportEntitlement(dealId);
  if (!gate.ok) return { ok: false, code: gate.code, message: gate.message };
  const { user, db } = gate;
  try {
    const { state } = await getDeal(db, user.orgId, dealId);
    const version = await createVersionHelper(db, { orgId: user.orgId, dealId, userId: user.id, state });
    const file = await exportFileHelper(db, { versionId: version.id, kind, baseUrl: await baseUrl() });
    revalidatePath(`/deals/${dealId}/package`);
    return { ok: true, versionId: version.id, versionNumber: version.number, fileId: file.fileId, name: file.name, url: fileDownloadUrl(file.fileId, file.name), bytes: file.bytes };
  } catch (e) {
    return { ok: false, code: 'export-failed', message: e instanceof Error ? e.message : 'Export failed' };
  }
}

/** Download an existing Version's file, generating it on first request. */
export async function versionFile(versionId: string, kind: 'pdf' | 'xlsx'): Promise<ExportResult> {
  const user = await requireUser();
  const db = await getDb();
  const { deal } = await getVersion(db, versionId);
  if (deal.orgId !== user.orgId) return { ok: false, code: 'forbidden', message: 'Not your deal' };
  const gate = await requireExportEntitlement(deal.id);
  if (!gate.ok) return { ok: false, code: gate.code, message: gate.message };
  try {
    const file = await exportFileHelper(db, { versionId, kind, baseUrl: await baseUrl() });
    const v = await getVersion(db, versionId);
    return { ok: true, versionId, versionNumber: v.version.number, fileId: file.fileId, name: file.name, url: fileDownloadUrl(file.fileId, file.name), bytes: file.bytes };
  } catch (e) {
    return { ok: false, code: 'export-failed', message: e instanceof Error ? e.message : 'Export failed' };
  }
}

export async function listVersions(dealId: string) {
  const user = await requireUser();
  const db = await getDb();
  return listVersionsQuery(db, user.orgId, dealId);
}

export async function createShare(versionId: string, expiresAt?: string | null): Promise<{ ok: true; url: string; token: string; id: string } | { ok: false; code: string; message: string }> {
  const user = await requireUser();
  const db = await getDb();
  const { deal } = await getVersion(db, versionId);
  if (deal.orgId !== user.orgId) return { ok: false, code: 'forbidden', message: 'Not your deal' };
  const gate = await requireExportEntitlement(deal.id);
  if (!gate.ok) return { ok: false, code: gate.code, message: gate.message };
  const share = await createShareHelper(db, { versionId, userId: user.id, expiresAt: expiresAt ?? null });
  revalidatePath(`/deals/${deal.id}/package`);
  return { ok: true, url: `${await baseUrl()}/share/${share.token}`, token: share.token, id: share.id };
}

export async function revokeShare(shareId: string, dealId: string) {
  const user = await requireUser();
  const db = await getDb();
  await requireMembership(db, user.id, user.orgId);
  await revokeShareQuery(db, shareId);
  revalidatePath(`/deals/${dealId}/package`);
}

export async function listShares(dealId: string) {
  const user = await requireUser();
  const db = await getDb();
  await getDeal(db, user.orgId, dealId);
  return listSharesQuery(db, dealId);
}

export async function markVersionReviewed(versionId: string) {
  const user = await requireUser();
  const db = await getDb();
  await requireMembership(db, user.id, user.orgId, ['reviewer']);
  const { deal } = await getVersion(db, versionId);
  if (deal.orgId !== user.orgId) throw new Error('Not your deal');
  await markReviewedQuery(db, versionId, user.settings.letterheadName ?? user.orgName);
  revalidatePath(`/deals/${deal.id}/package`);
}

export async function diffVersions(a: string, b: string) {
  const user = await requireUser();
  const db = await getDb();
  const va = await getVersion(db, a);
  const vb = await getVersion(db, b);
  if (va.deal.orgId !== user.orgId || vb.deal.orgId !== user.orgId) throw new Error('Not your deal');
  const rows = diffStates(va.version.snapshot, vb.version.snapshot);
  const oa = va.version.outputs as Record<string, DealOutputs>;
  const ob = vb.version.outputs as Record<string, DealOutputs>;
  const metrics = HEADLINE_METRICS.map((k) => ({ key: k, old: oa.likely?.metrics[k] ?? null, new: ob.likely?.metrics[k] ?? null })).filter((m) => m.old !== m.new);
  return { a: { number: va.version.number, createdAt: va.version.createdAt }, b: { number: vb.version.number, createdAt: vb.version.createdAt }, rows, metrics };
}
