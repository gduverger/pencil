import type { Grid, MetricKey } from '@pencil/engine';
import { catalogEntry } from '@pencil/engine';
import { heatColor } from '../charts';
import { formatByUnit, formatIrr, formatMultiple, formatPct, formatUsd } from '../format';
import type { SensitivityEntry } from '../types';

const METRIC_LABEL: Partial<Record<MetricKey, string>> = {
  projectIrr: 'Project IRR',
  lpIrr: 'LP IRR',
  gpIrr: 'GP IRR',
  unleveredIrr: 'Unlevered IRR',
  equityMultiple: 'Equity multiple',
  yieldOnCost: 'Yield on cost',
  developmentSpread: 'Development spread',
  totalProjectCost: 'Total project cost',
  saleValue: 'Sale value',
  profit: 'Profit',
  peakEquity: 'Peak equity',
  netToEquityAtSale: 'Net to equity at sale',
};

function fmt(metric: MetricKey, v: number | null): string {
  if (v === null) return '—';
  if (metric.endsWith('Irr')) return formatIrr(v);
  if (metric.endsWith('Multiple')) return formatMultiple(v);
  if (metric === 'yieldOnCost' || metric === 'developmentSpread') return formatPct(v);
  return formatUsd(v);
}

function axisLabel(path: string): string {
  return catalogEntry(path)?.label ?? path;
}

function axisValue(path: string, v: number): string {
  const unit = catalogEntry(path)?.unit ?? 'usd';
  return formatByUnit(v, unit);
}

export function SensitivityGrid({ grid, metric }: { grid: Grid; metric: MetricKey }) {
  const values = grid.rows.flat().map((c) => c.metrics[metric]).filter((v): v is number => v !== null);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const rank = (v: number | null) => (v === null || hi === lo ? 0 : (v - lo) / (hi - lo));
  return (
    <table className="t compact heat">
      <thead>
        <tr>
          <th>{`${axisLabel(grid.axisA.path)} ↓ / ${axisLabel(grid.axisB.path)} →`}</th>
          {grid.axisB.values.map((b, j) => (
            <th key={j} className={`num${grid.base.b === j ? ' highlight' : ''}`}>
              {axisValue(grid.axisB.path, b)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.rows.map((row, i) => (
          <tr key={i}>
            <th className={`num${grid.base.a === i ? ' highlight' : ''}`}>{axisValue(grid.axisA.path, grid.axisA.values[i]!)}</th>
            {row.map((cell, j) => {
              const v = cell.metrics[metric] ?? null;
              const isBase = grid.base.a === i && grid.base.b === j;
              return (
                <td key={j} className={`num${isBase ? ' highlight' : ''}`} style={{ background: isBase ? undefined : heatColor(rank(v)) }} title={cell.error}>
                  {cell.error ? 'n/a' : fmt(metric, v)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SensitivitiesPage({ entries, staleCount }: { entries: SensitivityEntry[]; staleCount: number }) {
  return (
    <>
      {entries.map((e) => (
        <div key={e.key} style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>{`${e.label} — ${e.scenario} scenario`}</h3>
          {e.grid.metrics.map((m) => (
            <div key={m} style={{ marginBottom: 8 }}>
              <div className="small" style={{ marginBottom: 2 }}>{METRIC_LABEL[m] ?? m}</div>
              <SensitivityGrid grid={e.grid} metric={m} />
            </div>
          ))}
        </div>
      ))}
      {staleCount > 0 ? <p className="stale-note">{`${staleCount} saved ${staleCount === 1 ? 'grid is' : 'grids are'} stale (inputs changed since it was run) and ${staleCount === 1 ? 'is' : 'are'} omitted. Re-run sensitivities to include ${staleCount === 1 ? 'it' : 'them'}.`}</p> : null}
      {entries.length === 0 && staleCount === 0 ? <p className="stale-note">No sensitivities have been run for this deal.</p> : null}
      <p className="footnote">Figures rounded; totals may not foot. The likely case is outlined; shading is light to dark from the lowest to the highest value in each grid.</p>
    </>
  );
}
