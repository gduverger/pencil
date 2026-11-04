'use client';

/**
 * The Results screen (spec 5 steps 3, 7, 8; FR-5, FR-6): the engine runs in the browser on every
 * input change, the three scenarios are always computed, and sensitivities run on demand on the
 * server and are saved with the deal.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { applyPatches, deleteSensitivity as deleteSensitivityLocal, scenarioOverrides, toDealInputs, tonightPaths, type DealState, type InputPatch } from '@pencil/db/state';
import { catalogEntry, runScenarios, sensitivityPresets, type DealOutputs, type MetricKey, type ScenarioKey } from '@pencil/engine';
import { AnnualCashFlowPage, CapitalBudgetPage, DEFAULT_PACKAGE_SETTINGS, ReturnsPage, SaleAnalysisPage, SourcesUsesPage, formatIrr, formatMultiple, formatPct, formatUsd, type PackageProps } from '@pencil/package-pages';
import { Badge, Button, Card, Select, cn } from '@/components/ui';
import { PackageStyles } from '@/components/package-styles';
import * as actions from '@/server/actions';
import { fromDisplay, toDisplay, unitLabel } from '@/components/inputs/format';
import { ExplainPanel } from './explain-panel';
import { ReviewerNotes } from './reviewer-notes';
import { SensitivitiesPanel } from './sensitivities-panel';

type Scenario = ScenarioKey;
const SECTIONS = [
  { key: 'returns', label: 'Returns' },
  { key: 'sourcesUses', label: 'Sources & uses' },
  { key: 'capitalBudget', label: 'Capital budget' },
  { key: 'annual', label: 'Annual cash flow' },
  { key: 'sale', label: 'Sale analysis' },
] as const;

export function ResultsScreen(props: { dealId: string; dealName: string; rev: number; state: DealState; userId: string; versionDate: string; engineVersion: string }) {
  const router = useRouter();
  const [state, setState] = useState(props.state);
  const [rev, setRev] = useState(props.rev);
  const [scenario, setScenario] = useState<Scenario>('likely');
  const [compare, setCompare] = useState(false);
  const [section, setSection] = useState<(typeof SECTIONS)[number]['key']>('returns');
  const [explainRef, setExplainRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [computeMs, setComputeMs] = useState<number | null>(null);
  const queue = useRef(Promise.resolve());

  // The engine runs here, in the browser, on every state change (instant results; the server runs
  // the same package at the same version for Versions).
  const { outputs, errorMessage } = useMemo(() => {
    const t0 = performance.now();
    try {
      const base = toDealInputs(state, 'likely');
      const out = runScenarios(base, scenarioOverrides(state));
      return { outputs: out, errorMessage: null as string | null, ms: performance.now() - t0 };
    } catch (e) {
      return { outputs: null, errorMessage: e instanceof Error ? e.message : String(e), ms: performance.now() - t0 };
    }
  }, [state]);
  useEffect(() => {
    setComputeMs(null);
    const id = window.setTimeout(() => setComputeMs(0), 0);
    return () => window.clearTimeout(id);
  }, [outputs]);

  const commit = useCallback((local: (s: DealState) => DealState, remote: (rev: number) => Promise<Awaited<ReturnType<typeof actions.updateInputs>>>) => {
    let unchanged = false;
    setState((s) => {
      try {
        const next = local(s);
        if (next === s) unchanged = true;
        return next;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        unchanged = true;
        return s;
      }
    });
    if (unchanged) return;
    queue.current = queue.current.then(async () => {
      const current = await new Promise<number>((resolve) => setRev((r) => (resolve(r), r)));
      const result = await remote(current);
      if (result.ok) setRev(result.rev);
      else if (result.code === 'rev-conflict') setConflict(`This deal was changed elsewhere (now at revision ${result.rev}). Reload before editing again.`);
      else setError(result.message);
    });
  }, []);

  const patch = (patches: InputPatch[]) => commit((s) => applyPatches(s, patches, props.userId, new Date().toISOString()).state, (r) => actions.updateInputs(props.dealId, r, patches));

  const presets = useMemo(() => {
    try {
      return sensitivityPresets(toDealInputs(state, 'likely'));
    } catch {
      return [];
    }
  }, [state]);

  const runGrid = async (spec: { id?: string; key: string; label: string; scenario: Scenario; axisA: { path: string; values: number[] }; axisB: { path: string; values: number[] }; metrics: MetricKey[] }) => {
    setRunning(true);
    try {
      const current = await new Promise<number>((resolve) => setRev((r) => (resolve(r), r)));
      const result = await actions.runSensitivity(props.dealId, current, spec);
      if (!result.ok) {
        if (result.code === 'rev-conflict') setConflict(`This deal was changed elsewhere (now at revision ${result.rev}). Reload before running sensitivities.`);
        else setError(result.message);
        return;
      }
      setRev(result.rev);
      router.refresh();
      // Pull the saved grid back by reloading the state from the server page props on refresh; meanwhile keep the UI responsive.
      const fresh = await actions.getDealStateForResults(props.dealId);
      if (fresh) {
        setState(fresh.state);
        setRev(fresh.rev);
      }
    } finally {
      setRunning(false);
    }
  };

  const deleteGrid = (id: string) => commit((s) => deleteSensitivityLocal(s, id), (r) => actions.deleteSensitivity(props.dealId, r, id));

  const packageProps: PackageProps | null = outputs
    ? {
        outputs,
        version: { dealName: props.dealName, versionNumber: 0, versionDate: props.versionDate, engineVersion: props.engineVersion },
        register: [],
        sensitivities: [],
        settings: { ...DEFAULT_PACKAGE_SETTINGS, scenario },
      }
    : null;

  const scenarios: Scenario[] = compare ? ['likely', 'best', 'worst'] : [scenario];
  const quick = tonightPaths().filter((p) => state.inputs[p] !== undefined);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
      <PackageStyles />
      <div className="xl:col-span-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)} aria-label="Scenario" data-testid="results-scenario">
              <option value="likely">Likely</option>
              <option value="best">Best</option>
              <option value="worst">Worst</option>
            </Select>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} data-testid="compare-toggle" />
              Compare all three
            </label>
            <div className="flex rounded-md bg-neutral-100 p-0.5 text-sm">
              {SECTIONS.map((s) => (
                <button key={s.key} type="button" onClick={() => setSection(s.key)} className={cn('rounded px-2.5 py-1', section === s.key ? 'bg-white font-medium shadow-sm' : 'text-neutral-600')} data-testid={`section-${s.key}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-xs text-neutral-500" data-testid="results-status">
            {computeMs === null ? 'Computing…' : `Live · rev ${rev}`}
          </div>
        </div>
        {conflict ? (
          <div className="mb-3 flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert" data-testid="conflict-banner">
            <span>{conflict}</span>
            <Button size="sm" variant="secondary" onClick={() => router.refresh()}>
              Reload
            </Button>
          </div>
        ) : null}
        {error ? <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900" role="alert">{error}</div> : null}
        {errorMessage || !outputs ? (
          <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900" data-testid="engine-error">
            The engine could not run this deal: {errorMessage}
          </div>
        ) : (
          <>
            <Headline outputs={outputs} onExplain={setExplainRef} />
            <div className={cn('mt-3', compare ? 'overflow-x-auto' : '')}>
              <div className={cn('flex gap-4', compare ? 'min-w-max' : '')}>
                {scenarios.map((sc) => (
                  <div key={sc} className="pkg" style={{ width: compare ? '8.5in' : '100%' }} data-testid={`results-${sc}`}>
                    {compare ? <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{sc}</div> : null}
                    <div className="page" style={{ width: '100%', minHeight: 0, padding: '0.3in', boxShadow: 'none', border: '1px solid #e5e5e5' }}>
                      {section === 'returns' ? <ReturnsPage props={{ ...packageProps!, settings: { ...packageProps!.settings, scenario: sc } }} /> : null}
                      {section === 'sourcesUses' ? <SourcesUsesPage props={{ ...packageProps!, settings: { ...packageProps!.settings, scenario: sc } }} /> : null}
                      {section === 'capitalBudget' ? <CapitalBudgetPage props={{ ...packageProps!, settings: { ...packageProps!.settings, scenario: sc } }} /> : null}
                      {section === 'annual' ? <AnnualCashFlowPage props={{ ...packageProps!, settings: { ...packageProps!.settings, scenario: sc } }} /> : null}
                      {section === 'sale' ? <SaleAnalysisPage props={{ ...packageProps!, settings: { ...packageProps!.settings, scenario: sc } }} /> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {outputs[scenario].flags.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-amber-800" data-testid="flags">
                {outputs[scenario].flags.map((f, i) => (
                  <li key={i}>⚑ {f.message}</li>
                ))}
              </ul>
            ) : null}
            <ReviewerNotes dealId={props.dealId} scenario={scenario} rev={rev} />
            <div className="mt-6">
              <SensitivitiesPanel saved={state.sensitivities} presets={presets} scenario={scenario} running={running} onRun={runGrid} onDelete={deleteGrid} />
            </div>
          </>
        )}
      </div>
      <div>
        <Card title="Quick inputs" actions={<span className="text-[11px] text-neutral-500">{scenario === 'likely' ? 'Likely values' : `${scenario} overrides`}</span>}>
          <p className="mb-2 text-xs text-neutral-500">The twelve inputs that drive the range. Changes recompute instantly and autosave; edit sources and notes on the Inputs screen.</p>
          <div className="space-y-1.5">
            {quick.map((path) => (
              <QuickInput key={path} path={path} state={state} scenario={scenario} onPatch={patch} />
            ))}
          </div>
        </Card>
      </div>
      {explainRef && outputs ? <ExplainPanel outputs={outputs[scenario]} cellRef={explainRef} onClose={() => setExplainRef(null)} dealId={props.dealId} scenario={scenario} /> : null}
    </div>
  );
}

function Headline({ outputs, onExplain }: { outputs: Record<Scenario, DealOutputs>; onExplain: (ref: string) => void }) {
  const tiles: Array<{ k: string; label: string; ref: string; f: (o: DealOutputs) => string }> = [
    { k: 'projectIrr', label: 'Project IRR', ref: 'metrics.projectIrr', f: (o) => formatIrr(o.metrics.projectIrr) },
    { k: 'lpIrr', label: 'LP IRR', ref: 'metrics.lpIrr', f: (o) => formatIrr(o.metrics.lpIrr) },
    { k: 'multiple', label: 'Equity multiple', ref: 'metrics.equityMultiple', f: (o) => formatMultiple(o.metrics.equityMultiple) },
    { k: 'yoc', label: 'Yield on cost', ref: 'metrics.yieldOnCost', f: (o) => formatPct(o.metrics.yieldOnCost) },
    { k: 'tpc', label: 'Total project cost', ref: 'metrics.totalProjectCost', f: (o) => formatUsd(o.totals.tpc) },
    { k: 'equity', label: 'Total equity', ref: 'metrics.totalEquity', f: (o) => formatUsd(o.metrics.totalEquity) },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="headline">
      {tiles.map((t) => (
        <div key={t.k} className="rounded-md border border-neutral-200 bg-white p-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">{t.label}</span>
            <button type="button" className="text-[10px] text-neutral-400 hover:text-neutral-700" onClick={() => onExplain(t.ref)} data-testid={`explain-${t.k}`} aria-label={`Explain ${t.label}`}>
              explain
            </button>
          </div>
          <div className="mt-0.5 text-base font-semibold tabular" data-testid={`tile-${t.k}`}>
            {t.f(outputs.likely)}
          </div>
          <div className="text-[11px] text-neutral-500 tabular">
            <span data-testid={`tile-${t.k}-best`}>{t.f(outputs.best)}</span> · <span data-testid={`tile-${t.k}-worst`}>{t.f(outputs.worst)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function QuickInput({ path, state, scenario, onPatch }: { path: string; state: DealState; scenario: Scenario; onPatch: (p: InputPatch[]) => void }) {
  const entry = catalogEntry(path);
  const unit = entry?.unit ?? 'usd';
  const likely = state.inputs[path];
  const override = scenario === 'likely' ? undefined : state.scenarios[scenario][path];
  const record = override ?? likely;
  const elaborated = (state.elaboration[path]?.length ?? 0) > 0;
  const [text, setText] = useState(toDisplay(record?.value, unit));
  useEffect(() => setText(toDisplay(record?.value, unit)), [record?.value, unit, scenario]);
  const commit = () => {
    const parsed = fromDisplay(text, unit);
    if (parsed === undefined || JSON.stringify(parsed) === JSON.stringify(record?.value)) return;
    onPatch([{ scenario, path, value: parsed, ...(scenario === 'likely' && (record?.source === 'benchmark' || record?.source === 'unknown') ? { source: 'my-number' } : {}) }]);
  };
  if (unit === 'flag' || unit === 'text') return null;
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="min-w-0 flex-1 truncate text-neutral-700" title={path}>
        {entry?.label ?? path}
        {override ? (
          <Badge tone="info" className="ml-1">
            override
          </Badge>
        ) : null}
      </span>
      <span className="flex items-center gap-1">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          disabled={elaborated}
          className="h-7 w-24 rounded border border-neutral-300 px-1.5 text-right text-xs tabular focus:border-blue-500 focus:outline-none"
          aria-label={entry?.label ?? path}
          data-testid={`quick-${path}`}
        />
        <span className="w-10 text-[10px] text-neutral-500">{unitLabel(unit)}</span>
      </span>
    </label>
  );
}
