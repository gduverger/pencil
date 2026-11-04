'use client';

import { useState } from 'react';
import type { SavedSensitivity } from '@pencil/db/state';
import { catalogEntry, inputCatalog, type MetricKey, type ScenarioKey, type SensitivityPreset } from '@pencil/engine';
import { SensitivityGrid } from '@pencil/package-pages';
import { Badge, Button, Card, Input, Select } from '@/components/ui';

const METRICS: Array<{ key: MetricKey; label: string }> = [
  { key: 'projectIrr', label: 'Project IRR' },
  { key: 'lpIrr', label: 'LP IRR' },
  { key: 'gpIrr', label: 'GP IRR' },
  { key: 'unleveredIrr', label: 'Unlevered IRR' },
  { key: 'equityMultiple', label: 'Equity multiple' },
  { key: 'yieldOnCost', label: 'Yield on cost' },
  { key: 'developmentSpread', label: 'Development spread' },
  { key: 'totalProjectCost', label: 'Total project cost' },
  { key: 'saleValue', label: 'Sale value' },
  { key: 'profit', label: 'Profit' },
  { key: 'peakEquity', label: 'Peak equity' },
];

function parseValues(text: string, unit: string): number[] {
  return text
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => Number(t.replace(/[$%]/g, '')))
    .filter((n) => Number.isFinite(n))
    .map((n) => (unit === 'pct' || unit === 'rate_pct' ? n / 100 : n));
}

export function SensitivitiesPanel({
  saved,
  presets,
  scenario,
  running,
  onRun,
  onDelete,
}: {
  saved: SavedSensitivity[];
  presets: SensitivityPreset[];
  scenario: ScenarioKey;
  running: boolean;
  onRun: (spec: { id?: string; key: string; label: string; scenario: ScenarioKey; axisA: { path: string; values: number[] }; axisB: { path: string; values: number[] }; metrics: MetricKey[] }) => void;
  onDelete: (id: string) => void;
}) {
  const numericPaths = inputCatalog().filter((e) => e.unit !== 'text' && e.unit !== 'flag');
  const [pathA, setPathA] = useState('exit.exitCapRatePct');
  const [valuesA, setValuesA] = useState('5, 5.5, 6');
  const [pathB, setPathB] = useState('costs.hard.perGrossSF');
  const [valuesB, setValuesB] = useState('280, 300, 320');
  const [metrics, setMetrics] = useState<MetricKey[]>(['projectIrr', 'yieldOnCost']);
  const [presetMetrics, setPresetMetrics] = useState<MetricKey[]>(['projectIrr', 'yieldOnCost']);
  const toggle = (list: MetricKey[], set: (m: MetricKey[]) => void, k: MetricKey) => set(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const runCustom = () => {
    const a = parseValues(valuesA, catalogEntry(pathA)?.unit ?? 'usd');
    const b = parseValues(valuesB, catalogEntry(pathB)?.unit ?? 'usd');
    if (a.length === 0 || b.length === 0 || metrics.length === 0) return;
    onRun({ key: `custom:${pathA}x${pathB}`, label: `${catalogEntry(pathA)?.label ?? pathA} × ${catalogEntry(pathB)?.label ?? pathB}`, scenario, axisA: { path: pathA, values: a }, axisB: { path: pathB, values: b }, metrics });
  };
  return (
    <div className="space-y-4" data-testid="sensitivities">
      <Card title="Sensitivities" actions={running ? <Badge tone="info">Running…</Badge> : null}>
        <p className="mb-3 text-xs text-neutral-500">Two-input grids on any metric, computed on demand and saved with the deal. A grid goes stale when any input in its scenario changes.</p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-neutral-600">Metrics for presets:</span>
          {METRICS.slice(0, 6).map((m) => (
            <label key={m.key} className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={presetMetrics.includes(m.key)} onChange={() => toggle(presetMetrics, setPresetMetrics, m.key)} />
              {m.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button key={p.key} variant="secondary" size="sm" disabled={running || presetMetrics.length === 0} onClick={() => onRun({ key: p.key, label: p.label, scenario, axisA: p.axisA, axisB: p.axisB, metrics: presetMetrics })} data-testid={`preset-${p.key}`}>
              Run: {p.label}
            </Button>
          ))}
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-neutral-700">Custom grid</summary>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Select value={pathA} onChange={(e) => setPathA(e.target.value)} className="w-full" aria-label="Axis A input">
                {numericPaths.map((e) => (
                  <option key={e.path} value={e.path}>
                    {e.label} ({e.path})
                  </option>
                ))}
              </Select>
              <Input value={valuesA} onChange={(e) => setValuesA(e.target.value)} placeholder="Values (percent for % inputs), comma separated" className="mt-1" aria-label="Axis A values" />
            </div>
            <div>
              <Select value={pathB} onChange={(e) => setPathB(e.target.value)} className="w-full" aria-label="Axis B input">
                {numericPaths.map((e) => (
                  <option key={e.path} value={e.path}>
                    {e.label} ({e.path})
                  </option>
                ))}
              </Select>
              <Input value={valuesB} onChange={(e) => setValuesB(e.target.value)} placeholder="Values" className="mt-1" aria-label="Axis B values" />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {METRICS.map((m) => (
              <label key={m.key} className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={metrics.includes(m.key)} onChange={() => toggle(metrics, setMetrics, m.key)} />
                {m.label}
              </label>
            ))}
            <Button size="sm" onClick={runCustom} disabled={running} data-testid="run-custom">
              Run custom grid
            </Button>
          </div>
        </details>
      </Card>
      {saved.map((s) => (
        <Card
          key={s.id}
          title={
            <span className="flex items-center gap-2">
              {s.label} <span className="font-normal text-neutral-500">· {s.scenario}</span>
              {s.stale ? (
                <span data-testid={`stale-${s.key}`}>
                  <Badge tone="warn" title="Inputs changed since this grid was run">
                    stale
                  </Badge>
                </span>
              ) : (
                <span data-testid={`fresh-${s.key}`}>
                  <Badge tone="good">fresh</Badge>
                </span>
              )}
            </span>
          }
          actions={
            <span className="flex gap-1">
              <Button variant="secondary" size="sm" disabled={running} onClick={() => onRun({ id: s.id, key: s.key, label: s.label, scenario: s.scenario, axisA: s.axisA, axisB: s.axisB, metrics: s.metrics })} data-testid={`rerun-${s.key}`}>
                Re-run
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDelete(s.id)} aria-label={`Delete ${s.label}`}>
                ×
              </Button>
            </span>
          }
          className={s.stale ? 'opacity-70' : ''}
        >
          <div className="pkg overflow-x-auto" data-testid={`grid-${s.key}`} data-stale={s.stale ? '1' : '0'}>
            {s.metrics.map((m) => (
              <div key={m} className="mb-3">
                <div className="mb-1 text-xs font-medium text-neutral-600">{METRICS.find((x) => x.key === m)?.label ?? m}</div>
                <SensitivityGrid grid={s.grid} metric={m} />
              </div>
            ))}
            <p className="text-[11px] text-neutral-500">
              Run {new Date(s.ranAt).toLocaleString('en-US')} · {s.grid.rows.length} × {s.grid.rows[0]?.length ?? 0} cells{s.grid.errors > 0 ? ` · ${s.grid.errors} cells could not run` : ''}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}
