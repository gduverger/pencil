'use client';

/**
 * The Inputs screen (spec 5 steps 2, 4, 5, 6, 7; FR-1 to FR-6). Every edit autosaves through a
 * server action carrying the deal's rev; the same pure state functions run locally for an instant
 * optimistic update. A stale rev shows a conflict banner instead of overwriting anything.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  addChild as addChildLocal,
  applyPatches,
  deleteChild as deleteChildLocal,
  deleteEvent as deleteEventLocal,
  elaboratedParentDisplayValue,
  setSwitch as setSwitchLocal,
  tonightPaths,
  updateChild as updateChildLocal,
  upsertEvent as upsertEventLocal,
  visibleInputPaths,
  type DealState,
  type InputPatch,
  type SwitchKey,
} from '@pencil/db/state';
import { SOURCES, type CatalogEntry, type Source, type Tier } from '@pencil/engine';
import { DEFAULT_TIERS } from '@pencil/engine';
import { Badge, Button, Select, cn } from '@/components/ui';
import * as actions from '@/server/actions';
import { ChildrenEditor } from './children-editor';
import { EventsPanel } from './events-panel';
import { formatRange, fromDisplay, toDisplay, unitLabel } from './format';
import { HistoryPanel } from './history-panel';
import { SwitchPanel } from './switch-panel';
import { TiersEditor } from './tiers-editor';
import type { InputsScreenProps, Scenario } from './types';
import { UnitMixImport } from './unit-mix-import';

const SECTION_LABELS: Record<string, string> = {
  meta: 'Deal',
  site: 'Site',
  program: 'Program',
  timeline: 'Timeline',
  costs: 'Costs',
  financing: 'Financing',
  operations: 'Operations',
  exit: 'Exit',
  equity: 'Equity',
};
const SECTION_ORDER = [
  'meta',
  'site',
  'program',
  'timeline',
  'costs',
  'financing',
  'operations',
  'exit',
  'equity',
];

type Result = Awaited<ReturnType<typeof actions.updateInputs>>;

export function InputsScreen(props: InputsScreenProps) {
  const router = useRouter();
  const [state, setState] = useState<DealState>(props.state);
  const [rev, setRev] = useState(props.rev);
  const [scenario, setScenario] = useState<Scenario>('likely');
  const [mode, setMode] = useState<'tonight' | 'all'>('tonight');
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const [historyPath, setHistoryPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.keys(props.state.elaboration).map((p) => [p, true])),
  );
  const catalogByPath = useMemo(
    () => new Map(props.catalog.map((e) => [e.path, e])),
    [props.catalog],
  );
  const stars = useMemo(() => new Set(tonightPaths()), []);
  const queue = useRef(Promise.resolve());

  // Another writer on this page (the assistant panel) can advance the deal; adopt the server's
  // newer state when nothing of ours is in flight so the next edit does not hit a rev conflict.
  useEffect(() => {
    if (props.rev > rev && saving === 0) {
      setState(props.state);
      setRev(props.rev);
      setConflict(null);
    }
  }, [props.rev, props.state, rev, saving]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`pencil:mode:${props.dealId}`);
      if (saved === 'all' || saved === 'tonight') setMode(saved);
    } catch {
      /* ignore */
    }
  }, [props.dealId]);
  const chooseMode = (m: 'tonight' | 'all') => {
    setMode(m);
    try {
      window.localStorage.setItem(`pencil:mode:${props.dealId}`, m);
    } catch {
      /* ignore */
    }
  };

  /** Optimistic local change plus the server action, serialized so revs stay in order. */
  const commit = useCallback(
    (local: (s: DealState) => DealState, remote: (rev: number) => Promise<Result>) => {
      let localFailed = false;
      let unchanged = false;
      setState((s) => {
        try {
          const next = local(s);
          if (next === s) unchanged = true;
          return next;
        } catch (e) {
          localFailed = true;
          setError(e instanceof Error ? e.message : String(e));
          return s;
        }
      });
      // setState's updater runs synchronously here (outside a batch) or on the next render; a
      // duplicate commit (Enter then blur) is dropped once the first has applied.
      if (localFailed || unchanged) return;
      setSaving((n) => n + 1);
      queue.current = queue.current
        .then(async () => {
          const current = await new Promise<number>((resolve) => setRev((r) => (resolve(r), r)));
          const result = await remote(current);
          if (result.ok) {
            setRev(result.rev);
            setError(null);
          } else if (result.code === 'rev-conflict') {
            setConflict(
              `This deal was changed elsewhere (now at revision ${result.rev}). Reload to see the latest values before editing again.`,
            );
          } else {
            setError(result.message);
          }
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setSaving((n) => n - 1));
    },
    [],
  );

  const now = () => new Date().toISOString();
  const patch = (patches: InputPatch[]) =>
    commit(
      (s) => applyPatches(s, patches, props.userId, now()).state,
      (r) => actions.updateInputs(props.dealId, r, patches),
    );

  const visible = useMemo(() => visibleInputPaths(state), [state]);
  const shown = useMemo(
    () => visible.filter((p) => (mode === 'tonight' ? stars.has(p) : true)),
    [visible, mode, stars],
  );
  const sections = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const p of shown) {
      const section = p.split('.')[0] ?? '';
      const list = groups.get(section) ?? [];
      list.push(p);
      groups.set(section, list);
    }
    return SECTION_ORDER.filter((s) => groups.has(s)).map((s) => ({
      key: s,
      label: SECTION_LABELS[s] ?? s,
      paths: groups.get(s)!,
    }));
  }, [shown]);

  const flagCount = useMemo(
    () => shown.filter((p) => isFlagged(p, state, props.benchmarks)).length,
    [shown, state, props.benchmarks],
  );

  const onValueKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-value-input]'));
    const i = inputs.indexOf(e.currentTarget);
    const next = inputs[e.key === 'ArrowUp' ? i - 1 : i + 1];
    if (next) {
      e.preventDefault();
      e.currentTarget.blur();
      next.focus();
      next.select();
    }
  };

  const tiers = (state.inputs['equity.tiers']?.value as Tier[] | undefined) ?? DEFAULT_TIERS;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex rounded-md bg-neutral-100 p-0.5 text-sm">
              <button
                type="button"
                className={cn(
                  'rounded px-3 py-1',
                  mode === 'tonight' ? 'bg-white font-medium shadow-sm' : 'text-neutral-600',
                )}
                onClick={() => chooseMode('tonight')}
                data-testid="mode-tonight"
              >
                Tonight
              </button>
              <button
                type="button"
                className={cn(
                  'rounded px-3 py-1',
                  mode === 'all' ? 'bg-white font-medium shadow-sm' : 'text-neutral-600',
                )}
                onClick={() => chooseMode('all')}
                data-testid="mode-all"
              >
                All inputs
              </button>
            </div>
            <Select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as Scenario)}
              aria-label="Scenario"
              data-testid="scenario-select"
            >
              <option value="likely">Likely (base)</option>
              <option value="best">Best</option>
              <option value="worst">Worst</option>
            </Select>
            {flagCount > 0 ? <Badge tone="warn">{`${flagCount} outside benchmark`}</Badge> : null}
          </div>
          <div className="text-xs text-neutral-500" data-testid="save-status">
            {saving > 0 ? 'Saving…' : `Saved · rev ${rev}`}
          </div>
        </div>
        {conflict ? (
          <div
            className="mb-3 flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            role="alert"
            data-testid="conflict-banner"
          >
            <span>{conflict}</span>
            <Button size="sm" variant="secondary" onClick={() => router.refresh()}>
              Reload
            </Button>
          </div>
        ) : null}
        {error ? (
          <div
            className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900"
            role="alert"
            data-testid="error-banner"
          >
            {error}
          </div>
        ) : null}
        {scenario !== 'likely' ? (
          <p className="mb-2 text-xs text-neutral-600">
            Editing the {scenario} scenario: a changed field becomes an override (marked); unchanged
            fields follow Likely.
          </p>
        ) : null}
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-medium text-neutral-600">
              <tr>
                <th className="w-[28%] px-3 py-2">Input</th>
                <th className="w-[16%] px-3 py-2">Value</th>
                <th className="w-[12%] px-3 py-2">Source</th>
                <th className="px-3 py-2">Note</th>
                <th className="w-[18%] px-3 py-2">Benchmark</th>
                <th className="w-[8%] px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <SectionRows
                  key={section.key}
                  label={section.label}
                  paths={section.paths}
                  state={state}
                  scenario={scenario}
                  catalogByPath={catalogByPath}
                  benchmarks={props.benchmarks}
                  stars={stars}
                  expanded={expanded}
                  onToggleExpand={(p) => setExpanded((e) => ({ ...e, [p]: !e[p] }))}
                  onPatch={patch}
                  onHistory={setHistoryPath}
                  onValueKey={onValueKey}
                  dealId={props.dealId}
                  userId={props.userId}
                  commit={commit}
                />
              ))}
            </tbody>
          </table>
        </div>
        {mode === 'tonight' ? (
          <p className="mt-2 text-xs text-neutral-500">
            Tonight mode shows the twelve inputs that drive the range. Switch to{' '}
            <button type="button" className="underline" onClick={() => chooseMode('all')}>
              All inputs
            </button>{' '}
            for everything else.
          </p>
        ) : null}
        {mode === 'all' ? (
          <TiersEditor
            tiers={tiers}
            onSave={(t) =>
              patch([{ scenario: 'likely', path: 'equity.tiers', value: t, source: 'my-number' }])
            }
          />
        ) : null}
        <EventsPanel
          events={state.events}
          onSave={(e) =>
            commit(
              (s) => upsertEventLocal(s, e, props.userId, now()).state,
              (r) => actions.upsertEvent(props.dealId, r, e),
            )
          }
          onDelete={(id) =>
            commit(
              (s) => deleteEventLocal(s, id, props.userId, now()).state,
              (r) => actions.deleteEvent(props.dealId, r, id),
            )
          }
        />
      </div>
      <div className="space-y-4">
        <SwitchPanel
          switches={props.switches}
          state={state.switches}
          onToggle={(key: SwitchKey, on) =>
            commit(
              (s) => setSwitchLocal(s, key, on, props.userId, now()).state,
              (r) => actions.setSwitch(props.dealId, r, key, on),
            )
          }
        />
        <UnitMixImport onImport={(patches) => patch(patches)} />
      </div>
      {historyPath ? (
        <HistoryPanel
          dealId={props.dealId}
          path={historyPath}
          label={catalogByPath.get(historyPath)?.label ?? historyPath}
          onClose={() => setHistoryPath(null)}
        />
      ) : null}
    </div>
  );
}

function isFlagged(
  path: string,
  state: DealState,
  benchmarks: InputsScreenProps['benchmarks'],
): boolean {
  const b = benchmarks[path];
  const v = state.inputs[path]?.value;
  return Boolean(b && typeof v === 'number' && (v < b.low || v > b.high));
}

interface SectionProps {
  label: string;
  paths: string[];
  state: DealState;
  scenario: Scenario;
  catalogByPath: Map<string, CatalogEntry>;
  benchmarks: InputsScreenProps['benchmarks'];
  stars: Set<string>;
  expanded: Record<string, boolean>;
  onToggleExpand: (path: string) => void;
  onPatch: (patches: InputPatch[]) => void;
  onHistory: (path: string) => void;
  onValueKey: (e: KeyboardEvent<HTMLInputElement>) => void;
  dealId: string;
  userId: string;
  commit: (local: (s: DealState) => DealState, remote: (rev: number) => Promise<Result>) => void;
}

function SectionRows(p: SectionProps) {
  return (
    <>
      <tr className="bg-neutral-50/60">
        <td
          colSpan={6}
          className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500"
        >
          {p.label}
        </td>
      </tr>
      {p.paths.map((path) => (
        <InputRow key={path} path={path} {...p} />
      ))}
    </>
  );
}

function InputRow(p: SectionProps & { path: string }) {
  const { path, state, scenario } = p;
  const entry = p.catalogByPath.get(path);
  const unit = entry?.unit ?? 'usd';
  const likely = state.inputs[path];
  const override = scenario === 'likely' ? undefined : state.scenarios[scenario][path];
  const record = override ?? likely;
  const children = state.elaboration[path];
  const elaborated = Boolean(children && children.length > 0);
  const derived = elaborated ? elaboratedParentDisplayValue(state, path) : null;
  const value = elaborated ? derived : record?.value;
  const [text, setText] = useState(toDisplay(value, unit));
  const [note, setNote] = useState(record?.note ?? '');
  useEffect(() => {
    setText(toDisplay(elaborated ? derived : record?.value, unit));
    setNote(record?.note ?? '');
  }, [record?.value, record?.note, scenario, elaborated, derived]);
  const b = p.benchmarks[path];
  const flagged =
    typeof record?.value === 'number' && b ? record.value < b.low || record.value > b.high : false;
  const isSwitchHidden = false;
  if (isSwitchHidden) return null;
  const lastCommitted = useRef<string | null>(null);
  const commitValue = () => {
    if (elaborated) return;
    const parsed = fromDisplay(text, unit);
    if (parsed === undefined) {
      setText(toDisplay(record?.value, unit));
      return;
    }
    if (JSON.stringify(parsed) === JSON.stringify(record?.value)) return;
    if (lastCommitted.current === JSON.stringify([scenario, parsed])) return;
    lastCommitted.current = JSON.stringify([scenario, parsed]);
    p.onPatch([
      {
        scenario,
        path,
        value: parsed,
        ...(scenario === 'likely' &&
        (record?.source === 'benchmark' || record?.source === 'unknown')
          ? { source: 'my-number' }
          : {}),
      },
    ]);
  };
  const commitNote = () => {
    if (note === (record?.note ?? '')) return;
    if (scenario !== 'likely' && !override) {
      p.onPatch([{ scenario, path, value: likely?.value, note }]);
      return;
    }
    p.onPatch([{ scenario, path, note }]);
  };
  const changeSource = (source: Source) => {
    if (scenario !== 'likely' && !override) {
      p.onPatch([{ scenario, path, value: likely?.value, source }]);
      return;
    }
    p.onPatch([{ scenario, path, source }]);
  };
  return (
    <>
      <tr
        className={cn('border-t border-neutral-100 align-top', override ? 'bg-blue-50/40' : '')}
        data-testid={`row-${path}`}
      >
        <td className="px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-neutral-800">{entry?.label ?? path}</span>
            {p.stars.has(path) ? (
              <span className="text-amber-500" title="One of the twelve tonight inputs">
                ★
              </span>
            ) : null}
            {override ? (
              <Badge
                tone="info"
                title={`Likely: ${toDisplay(likely?.value, unit)} ${unitLabel(unit)}`}
              >
                override
              </Badge>
            ) : null}
          </div>
          <div className="text-[10px] text-neutral-400">{path}</div>
          {entry?.help ? <div className="text-xs text-neutral-500">{entry.help}</div> : null}
        </td>
        <td className="px-3 py-1.5">
          {unit === 'flag' ? (
            <Select
              value={String(Boolean(record?.value))}
              onChange={(e) => p.onPatch([{ scenario, path, value: e.target.value === 'true' }])}
              className="w-full"
              aria-label={entry?.label ?? path}
              data-value-input
              data-testid={`value-${path}`}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </Select>
          ) : (
            <div className="flex items-center gap-1">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={commitValue}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitValue();
                  p.onValueKey(e);
                }}
                disabled={elaborated}
                aria-label={entry?.label ?? path}
                data-value-input
                data-testid={`value-${path}`}
                className={cn(
                  'h-8 w-full rounded-md border border-neutral-300 px-2 text-right text-sm tabular focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
                  elaborated ? 'bg-neutral-100 text-neutral-600' : 'bg-white',
                  flagged ? 'border-amber-400' : '',
                )}
                inputMode={unit === 'text' ? 'text' : 'decimal'}
              />
              <span className="w-12 text-[11px] text-neutral-500">{unitLabel(unit)}</span>
            </div>
          )}
          {elaborated ? (
            <div className="text-[11px] text-neutral-500">
              Σ of {children!.length} children (read-only)
            </div>
          ) : null}
        </td>
        <td className="px-3 py-1.5">
          <Select
            value={record?.source ?? 'unknown'}
            onChange={(e) => changeSource(e.target.value as Source)}
            className="h-8 w-full text-xs"
            aria-label={`Source of ${entry?.label ?? path}`}
            data-testid={`source-${path}`}
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-3 py-1.5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commitNote}
            onKeyDown={(e) => e.key === 'Enter' && commitNote()}
            placeholder="Why, from where"
            aria-label={`Note for ${entry?.label ?? path}`}
            data-testid={`note-${path}`}
            className="h-8 w-full rounded-md border border-neutral-300 px-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="text-[10px] text-neutral-400">
            {record?.updatedAt
              ? `${record.updatedAt.slice(0, 10)} · ${record.updatedBy.slice(0, 12)}`
              : ''}
          </div>
        </td>
        <td className="px-3 py-1.5 text-xs">
          {b ? (
            <div>
              <div className="text-neutral-700">{formatRange(b.low, b.high, unit)}</div>
              <div className="text-[10px] text-neutral-400">
                {b.source}, {b.asOf}
                {b.sampleSize ? ` (n=${b.sampleSize})` : ''}
              </div>
              {flagged ? (
                <Badge
                  tone="warn"
                  className="mt-0.5"
                  title={`Outside the ${formatRange(b.low, b.high, unit)} range`}
                >
                  outside range
                </Badge>
              ) : null}
            </div>
          ) : (
            <span className="text-neutral-400">—</span>
          )}
        </td>
        <td className="px-3 py-1.5 text-right text-xs">
          <button
            type="button"
            className="text-neutral-500 underline-offset-2 hover:underline"
            onClick={() => p.onHistory(path)}
            data-testid={`history-${path}`}
          >
            history
          </button>
          {entry?.elaborable && scenario === 'likely' ? (
            <button
              type="button"
              className="ml-2 text-neutral-500 underline-offset-2 hover:underline"
              onClick={() => p.onToggleExpand(path)}
              data-testid={`elaborate-${path}`}
            >
              {elaborated
                ? p.expanded[path]
                  ? 'collapse'
                  : `expand (${children!.length})`
                : 'elaborate'}
            </button>
          ) : null}
          {override ? (
            <button
              type="button"
              className="ml-2 text-neutral-500 underline-offset-2 hover:underline"
              onClick={() => p.onPatch([{ scenario, path, clear: true }])}
              data-testid={`clear-${path}`}
            >
              clear
            </button>
          ) : null}
        </td>
      </tr>
      {entry?.elaborable &&
      scenario === 'likely' &&
      (p.expanded[path] || (elaborated && p.expanded[path] !== false)) ? (
        <tr className="border-t border-neutral-100">
          <td colSpan={6} className="px-3 pb-2">
            <ChildrenEditor
              path={path}
              unit={
                path === 'costs.hard.perGrossSF' || path === 'costs.soft.pctOfHard' ? 'usd' : unit
              }
              children={children ?? []}
              onAdd={(c) =>
                p.commit(
                  (s) => addChildLocal(s, path, c, p.userId, new Date().toISOString()).state,
                  (r) => actions.addChild(p.dealId, r, path, c),
                )
              }
              onUpdate={(id, changes) =>
                p.commit(
                  (s) =>
                    updateChildLocal(s, path, id, changes, p.userId, new Date().toISOString())
                      .state,
                  (r) => actions.updateChild(p.dealId, r, path, id, changes),
                )
              }
              onDelete={(id) =>
                p.commit(
                  (s) => deleteChildLocal(s, path, id, p.userId, new Date().toISOString()).state,
                  (r) => actions.deleteChild(p.dealId, r, path, id),
                )
              }
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}
