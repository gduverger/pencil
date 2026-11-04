'use client';

/**
 * The Package screen (spec 5 step 9; FR-7): page toggles, scenario, letterhead, cover note and
 * narrative; Export PDF / Export Excel create a Version and the file; Share creates a read-only
 * link to a Version; Diff versions lists what changed between two Versions.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DealState } from '@pencil/db/state';
import { scenarioOverrides, toDealInputs } from '@pencil/db/state';
import { runScenarios, type ScenarioKey } from '@pencil/engine';
import { PAGE_KEYS, PAGE_TITLES, PackageDocument, type PackageProps, type PackageSettings } from '@pencil/package-pages';
import { Badge, Button, Card, Select, Textarea, cn } from '@/components/ui';
import { PackageStyles } from '@/components/package-styles';
import { UpgradeButtons } from '@/components/billing/upgrade-buttons';
import * as actions from '@/server/actions';
import { draftNarrative } from '@/server/assistant-actions';
import type { DiffRow } from '@/server/package-props';
import { formatByUnit } from '@pencil/package-pages';

export interface VersionRow {
  id: string;
  number: number;
  engineVersion: string;
  createdBy: string;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface ShareRow {
  id: string;
  versionId: string;
  versionNumber: number;
  token: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function PackageScreen(props: { dealId: string; dealName: string; rev: number; state: DealState; previewProps: Omit<PackageProps, 'outputs'>; versions: VersionRow[]; shares: ShareRow[]; baseUrl: string; canExport: boolean; isReviewer: boolean; userId: string; assistantAvailable: boolean }) {
  const router = useRouter();
  const [state, setState] = useState(props.state);
  const [rev, setRev] = useState(props.rev);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'good' | 'warn' | 'info'; text: string; url?: string; name?: string } | null>(null);
  const [preview, setPreview] = useState(true);
  const [diff, setDiff] = useState<{ a: string; b: string; result: Awaited<ReturnType<typeof actions.diffVersions>> | null }>({ a: props.versions[1]?.id ?? '', b: props.versions[0]?.id ?? '', result: null });
  const [expiry, setExpiry] = useState<'never' | '7' | '30' | '90'>('30');
  const settings = state.packageSettings;

  const outputs = useMemo(() => {
    try {
      return runScenarios(toDealInputs(state, 'likely'), scenarioOverrides(state));
    } catch {
      return null;
    }
  }, [state]);

  const save = async (changes: Partial<PackageSettings>) => {
    setState((s) => ({ ...s, packageSettings: { ...s.packageSettings, ...changes, pages: { ...s.packageSettings.pages, ...(changes.pages ?? {}) } } }));
    const result = await actions.updatePackageSettings(props.dealId, rev, changes);
    if (result.ok) setRev(result.rev);
    else setMessage({ tone: 'warn', text: result.message });
  };

  const exportKind = async (kind: 'pdf' | 'xlsx') => {
    setBusy(kind);
    setMessage({ tone: 'info', text: kind === 'pdf' ? 'Creating a Version and rendering the PDF…' : 'Creating a Version and building the workbook…' });
    try {
      const result = await actions.exportVersion(props.dealId, kind);
      if (!result.ok) {
        setMessage({ tone: 'warn', text: result.message });
        return;
      }
      setMessage({ tone: 'good', text: `Version ${result.versionNumber} created · ${result.name} (${Math.round(result.bytes / 1024)} KB)`, url: result.url, name: result.name });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const download = async (versionId: string, kind: 'pdf' | 'xlsx') => {
    setBusy(`${versionId}:${kind}`);
    try {
      const result = await actions.versionFile(versionId, kind);
      if (!result.ok) setMessage({ tone: 'warn', text: result.message });
      else window.location.href = result.url;
    } finally {
      setBusy(null);
    }
  };

  const share = async (versionId: string) => {
    setBusy(`share:${versionId}`);
    try {
      const expiresAt = expiry === 'never' ? null : new Date(Date.now() + Number(expiry) * 86400_000).toISOString();
      const result = await actions.createShare(versionId, expiresAt);
      if (!result.ok) setMessage({ tone: 'warn', text: result.message });
      else {
        setMessage({ tone: 'good', text: `Share link created: ${result.url}`, url: result.url, name: 'Open share link' });
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  };

  const diffA = diff.a || props.versions[1]?.id || '';
  const diffB = diff.b || props.versions[0]?.id || '';
  const runDiff = async () => {
    if (!diffA || !diffB || diffA === diffB) return;
    const result = await actions.diffVersions(diffA, diffB);
    setDiff((d) => ({ ...d, a: diffA, b: diffB, result }));
  };

  const previewProps: PackageProps | null = outputs ? { ...props.previewProps, outputs, settings } : null;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <PackageStyles />
      <div className="space-y-4">
        <Card title="Pages">
          <ul className="space-y-1">
            {PAGE_KEYS.map((k, i) => (
              <li key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.pages[k]} onChange={(e) => save({ pages: { ...settings.pages, [k]: e.target.checked } })} data-testid={`page-${k}`} id={`page-${k}`} />
                <label htmlFor={`page-${k}`}>
                  {i + 1}. {PAGE_TITLES[k]}
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.includeMonthlyAppendix} onChange={(e) => save({ includeMonthlyAppendix: e.target.checked })} id="monthly" />
            <label htmlFor="monthly">Include the monthly schedule in the appendix</label>
          </div>
          <div className="mt-3">
            <label className="block text-xs font-medium text-neutral-600" htmlFor="pkg-scenario">
              Scenario on detail pages
            </label>
            <Select id="pkg-scenario" value={settings.scenario} onChange={(e) => save({ scenario: e.target.value as ScenarioKey })} className="mt-1 w-full">
              <option value="likely">Likely</option>
              <option value="best">Best</option>
              <option value="worst">Worst</option>
            </Select>
            <p className="mt-1 text-xs text-neutral-500">The summary and returns pages always show all three.</p>
          </div>
        </Card>
        <Card title="Cover and narrative">
          <label className="block text-xs font-medium text-neutral-600" htmlFor="cover">
            Cover note
          </label>
          <Textarea id="cover" rows={3} defaultValue={settings.coverNote ?? ''} onBlur={(e) => e.target.value !== (settings.coverNote ?? '') && save({ coverNote: e.target.value })} placeholder="Prepared for …" data-testid="cover-note" />
          <div className="mt-3 flex items-center justify-between">
            <label className="block text-xs font-medium text-neutral-600" htmlFor="narrative">
              Narrative (summary page){settings.narrativeDrafted ? <Badge tone="info" className="ml-2">drafted by the assistant</Badge> : null}
            </label>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null || !props.assistantAvailable}
              data-testid="draft-narrative"
              onClick={async () => {
                setBusy('narrative');
                try {
                  const r = await draftNarrative(props.dealId, rev);
                  if (!r.ok) setMessage({ tone: 'warn', text: r.message });
                  else {
                    setRev(r.rev);
                    setState((s) => ({ ...s, packageSettings: { ...s.packageSettings, narrative: r.text, narrativeDrafted: true } }));
                    setMessage(r.warning ? { tone: 'warn', text: r.warning } : { tone: 'good', text: 'Narrative drafted by the assistant from the register and the headline metrics; edit it to make it yours.' });
                  }
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === 'narrative' ? 'Drafting…' : 'Draft narrative'}
            </Button>
          </div>
          <Textarea key={settings.narrativeDrafted ? `d-${settings.narrative?.length ?? 0}` : 'u'} id="narrative" rows={6} defaultValue={settings.narrative ?? ''} onBlur={(e) => e.target.value !== (settings.narrative ?? '') && save({ narrative: e.target.value, narrativeDrafted: false })} placeholder="About 120 words: what is being built, where, the key assumptions and their sources, and the range of returns." data-testid="narrative" />
          <p className="mt-2 text-xs text-neutral-500">Letterhead comes from the organization settings.</p>
        </Card>
        <Card title="Export and share">
          {!props.canExport ? (
            <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="upgrade-prompt">
              <p className="mb-2">Exports and share links need a Per-deal purchase ($199, 12 months of exports and shares of this deal) or a Pro subscription ($2,400/year for the organization). Results stay available on screen.</p>
              <UpgradeButtons dealId={props.dealId} />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => exportKind('pdf')} disabled={busy !== null || !props.canExport} data-testid="export-pdf">
              {busy === 'pdf' ? 'Rendering…' : 'Export PDF'}
            </Button>
            <Button onClick={() => exportKind('xlsx')} disabled={busy !== null || !props.canExport} variant="secondary" data-testid="export-xlsx">
              {busy === 'xlsx' ? 'Building…' : 'Export Excel'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">Each export creates an immutable Version of the inputs, outputs and package settings. Re-exporting after a change creates a new Version; old share links keep showing their own.</p>
          {message ? (
            <div className={cn('mt-3 rounded-md p-2 text-sm', message.tone === 'good' ? 'bg-emerald-50 text-emerald-900' : message.tone === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-blue-50 text-blue-900')} role="status" data-testid="package-message">
              {message.text}
              {message.url ? (
                <>
                  {' '}
                  <a href={message.url} className="underline" data-testid="message-link" target={message.url.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                    {message.name ?? 'Download'}
                  </a>
                </>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>
      <div className="space-y-4 xl:col-span-2">
        <Card title={`Versions (${props.versions.length})`} actions={<label className="flex items-center gap-1 text-xs">Share links expire after <Select value={expiry} onChange={(e) => setExpiry(e.target.value as typeof expiry)} className="h-7 text-xs"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="never">never</option></Select></label>}>
          {props.versions.length === 0 ? (
            <p className="text-sm text-neutral-600">No Versions yet. Export the PDF or the Excel workbook to create the first one.</p>
          ) : (
            <table className="w-full text-sm" data-testid="versions">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="py-1">Version</th>
                  <th className="py-1">Created</th>
                  <th className="py-1">Engine</th>
                  <th className="py-1">Reviewed</th>
                  <th className="py-1 text-right">Files and sharing</th>
                </tr>
              </thead>
              <tbody>
                {props.versions.map((v) => (
                  <tr key={v.id} className="border-t border-neutral-100" data-testid={`version-${v.number}`}>
                    <td className="py-1.5 font-medium">{v.number}</td>
                    <td className="py-1.5 text-neutral-600">{new Date(v.createdAt).toLocaleString('en-US')}</td>
                    <td className="py-1.5 text-neutral-600">{v.engineVersion}</td>
                    <td className="py-1.5">
                      {v.reviewedBy ? (
                        <Badge tone="good">by {v.reviewedBy}</Badge>
                      ) : props.isReviewer ? (
                        <Button size="sm" variant="ghost" onClick={() => actions.markVersionReviewed(v.id).then(() => router.refresh())}>
                          Mark reviewed
                        </Button>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => download(v.id, 'pdf')} data-testid={`download-pdf-${v.number}`}>
                        PDF
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => download(v.id, 'xlsx')} data-testid={`download-xlsx-${v.number}`}>
                        Excel
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy !== null || !props.canExport} onClick={() => share(v.id)} data-testid={`share-${v.number}`}>
                        Share
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {props.shares.length > 0 ? (
            <div className="mt-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Share links</h3>
              <ul className="space-y-1 text-sm" data-testid="shares">
                {props.shares.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-200 p-2" data-testid={`share-row-${s.id}`}>
                    <span className="min-w-0 truncate">
                      <span className="text-neutral-500">v{s.versionNumber} · </span>
                      {s.revokedAt ? (
                        <span className="text-neutral-500 line-through">{`${props.baseUrl}/share/${s.token}`}</span>
                      ) : (
                        <a href={`/share/${s.token}`} target="_blank" rel="noreferrer" className="underline">
                          {`${props.baseUrl}/share/${s.token}`}
                        </a>
                      )}
                      <span className="ml-2 text-xs text-neutral-500">{s.revokedAt ? 'revoked' : s.expiresAt ? `expires ${s.expiresAt.slice(0, 10)}` : 'no expiry'}</span>
                    </span>
                    {!s.revokedAt ? (
                      <Button size="sm" variant="ghost" onClick={() => actions.revokeShare(s.id, props.dealId).then(() => router.refresh())} data-testid={`revoke-${s.id}`}>
                        Revoke
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
        {props.versions.length >= 2 ? (
          <Card title="Diff versions">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Select value={diffA} onChange={(e) => setDiff((d) => ({ ...d, a: e.target.value }))} aria-label="From version" data-testid="diff-a">
                {props.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version {v.number}
                  </option>
                ))}
              </Select>
              <span>→</span>
              <Select value={diffB} onChange={(e) => setDiff((d) => ({ ...d, b: e.target.value }))} aria-label="To version" data-testid="diff-b">
                {props.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version {v.number}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="secondary" onClick={runDiff} data-testid="diff-run">
                Compare
              </Button>
            </div>
            {diff.result ? <DiffView rows={diff.result.rows} metrics={diff.result.metrics} /> : null}
          </Card>
        ) : null}
        <Card title="Preview (live state)" actions={<Button size="sm" variant="ghost" onClick={() => setPreview((v) => !v)}>{preview ? 'Hide' : 'Show'}</Button>}>
          {preview && previewProps ? (
            <div className="overflow-x-auto rounded border border-neutral-200 bg-[#e9e8e4] p-2" data-testid="package-preview">
              <PackageDocument props={previewProps} />
            </div>
          ) : previewProps ? (
            <p className="text-sm text-neutral-500">Preview hidden.</p>
          ) : (
            <p className="text-sm text-red-700">The engine cannot run the current inputs; fix the flagged inputs first.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function DiffView({ rows, metrics }: { rows: DiffRow[]; metrics: Array<{ key: string; old: number | null; new: number | null }> }) {
  const fmt = (k: string, v: number | null) => (v === null ? '—' : k.endsWith('Irr') ? formatByUnit(v, 'irr') : k === 'equityMultiple' ? formatByUnit(v, 'multiple') : k === 'yieldOnCost' ? formatByUnit(v, 'pct') : formatByUnit(v, 'usd'));
  return (
    <div className="mt-3 space-y-3" data-testid="diff-result">
      {rows.length === 0 ? <p className="text-sm text-neutral-600">No input changed between these Versions.</p> : null}
      {rows.length > 0 ? (
        <table className="w-full text-xs">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="py-1">Input</th>
              <th className="py-1">Scenario</th>
              <th className="py-1">Old</th>
              <th className="py-1">New</th>
              <th className="py-1">Note</th>
              <th className="py-1">Who / when</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.scenario}:${r.path}`} className="border-t border-neutral-100" data-testid="diff-row">
                <td className="py-1">
                  {r.label}
                  <div className="text-[10px] text-neutral-400">{r.path}</div>
                </td>
                <td className="py-1">{r.scenario}</td>
                <td className="py-1 tabular">{String(r.old ?? '—')}</td>
                <td className="py-1 tabular">{String(r.new ?? '—')}</td>
                <td className="py-1 text-neutral-600">{r.newNote || r.oldNote}</td>
                <td className="py-1 text-neutral-500">
                  {r.who.slice(0, 12)} {r.when ? r.when.slice(0, 10) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {metrics.length > 0 ? (
        <table className="w-full text-xs">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="py-1">Headline metric (Likely)</th>
              <th className="py-1">Old</th>
              <th className="py-1">New</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.key} className="border-t border-neutral-100">
                <td className="py-1">{m.key}</td>
                <td className="py-1 tabular">{fmt(m.key, m.old)}</td>
                <td className="py-1 tabular">{fmt(m.key, m.new)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
