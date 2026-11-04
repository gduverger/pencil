/**
 * Versions, exports and shares (FR-7). A Version freezes inputs, switches, events, scenarios,
 * engine outputs, sensitivities and package settings with the engine version; files are generated
 * from the Version, never from live state; shares reference one Version and are read-only.
 */
import { createShare as createShareQuery, createVersion as createVersionQuery, getOrganization, getVersion, listFiles, recordFile, type Db, type DealState } from '@pencil/db';
import { scenarioOverrides, toDealInputs } from '@pencil/db/state';
import { ENGINE_VERSION, runScenarios, type DealOutputs, type ScenarioKey } from '@pencil/engine';
import { packageFileName, type PackageProps } from '@pencil/package-pages';
import { buildWorkbookBuffer } from '@pencil/exports';
import { CONTENT_TYPES, storage } from '@/lib/storage';
import { newShareToken, signToken } from '@/lib/tokens';
import { buildPackageProps, loadBenchmarks } from './package-props';

export type Outputs = Record<ScenarioKey, DealOutputs>;

export function runAllScenarios(state: DealState): Outputs {
  return runScenarios(toDealInputs(state, 'likely'), scenarioOverrides(state));
}

export async function createVersion(db: Db, args: { orgId: string; dealId: string; userId: string; state: DealState }) {
  const outputs = runAllScenarios(args.state);
  return createVersionQuery(db, { orgId: args.orgId, dealId: args.dealId, userId: args.userId, snapshot: args.state, outputs, engineVersion: ENGINE_VERSION });
}

export async function versionPackageProps(db: Db, versionId: string): Promise<{ props: PackageProps; dealName: string; orgId: string; scenario: ScenarioKey; versionDate: string }> {
  const { version, deal } = await getVersion(db, versionId);
  const org = await getOrganization(db, deal.orgId);
  const benchmarks = await loadBenchmarks(db);
  const outputs = version.outputs as Outputs;
  const versionDate = version.createdAt.slice(0, 10);
  const props = buildPackageProps({
    state: version.snapshot,
    outputs,
    version: { dealName: deal.name, versionNumber: version.number, versionDate, engineVersion: version.engineVersion, ...(version.reviewedBy ? { reviewedBy: version.reviewedBy } : {}), ...(org.settings.letterheadName ? { preparedBy: org.settings.letterheadName } : {}) },
    org: { name: org.name, settings: org.settings },
    benchmarks,
  });
  return { props, dealName: deal.name, orgId: deal.orgId, scenario: version.snapshot.packageSettings.scenario, versionDate };
}

/** The signed URL the renderer fetches (valid for 10 minutes). */
export function renderUrl(baseUrl: string, versionId: string): string {
  const token = signToken({ v: versionId, k: 'render' }, 600);
  return `${baseUrl.replace(/\/$/, '')}/packages/${versionId}?t=${encodeURIComponent(token)}`;
}

async function renderPdf(url: string, footerText: string): Promise<Buffer> {
  const service = process.env.PENCIL_RENDER_URL;
  if (service) {
    const { renderPdf: viaService } = await import('@pencil/exports');
    return viaService({ url, footerText }, { url: service, token: process.env.RENDER_TOKEN });
  }
  // No render service configured (local development, tests): drive Chromium in this process.
  const { urlToPdf } = await import('@pencil/render');
  return urlToPdf(url, { footerText });
}

/** Generate (or reuse) a Version's file and record it. */
export async function exportFile(db: Db, args: { versionId: string; kind: 'pdf' | 'xlsx'; baseUrl: string }): Promise<{ fileId: string; name: string; bytes: number; reused: boolean }> {
  const existing = (await listFiles(db, args.versionId)).find((f) => f.kind === args.kind);
  const { props, dealName, scenario, versionDate } = await versionPackageProps(db, args.versionId);
  const name = packageFileName(dealName, scenario, versionDate, args.kind);
  if (existing) return { fileId: existing.id, name, bytes: existing.bytes, reused: true };
  const started = Date.now();
  let bytes: Buffer;
  if (args.kind === 'pdf') {
    bytes = await renderPdf(renderUrl(args.baseUrl, args.versionId), `${dealName} · Version ${props.version.versionNumber} · ${versionDate}`);
  } else {
    bytes = await buildWorkbookBuffer({ outputs: props.outputs, scenario, version: props.version, register: props.register });
  }
  const key = `versions/${args.versionId}/${name}`;
  await storage().put(key, bytes, CONTENT_TYPES[args.kind]);
  const file = await recordFile(db, { versionId: args.versionId, kind: args.kind, storageKey: key, bytes: bytes.length });
  console.log(JSON.stringify({ level: 'info', event: 'export', versionId: args.versionId, kind: args.kind, bytes: bytes.length, ms: Date.now() - started }));
  return { fileId: file.id, name, bytes: bytes.length, reused: false };
}

/** A short-lived signed download URL for a stored file (spec 11.5). */
export function fileDownloadUrl(fileId: string, name: string, ttlSeconds = 900): string {
  const token = signToken({ f: fileId, k: 'file' }, ttlSeconds);
  return `/api/files/${fileId}?t=${encodeURIComponent(token)}&name=${encodeURIComponent(name)}`;
}

export async function createShare(db: Db, args: { versionId: string; userId: string; expiresAt?: string | null }) {
  return createShareQuery(db, { versionId: args.versionId, userId: args.userId, token: newShareToken(), expiresAt: args.expiresAt ?? null });
}
