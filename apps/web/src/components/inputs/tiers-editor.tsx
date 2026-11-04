'use client';

import { useState } from 'react';
import type { Tier } from '@pencil/engine';
import { Button, Card, Input } from '@/components/ui';

export function TiersEditor({ tiers, onSave }: { tiers: Tier[]; onSave: (tiers: Tier[]) => void }) {
  const [rows, setRows] = useState<Array<{ hurdle: string; lp: string; gp: string }>>(tiers.map((t) => ({ hurdle: t.hurdleIrrPct === null ? '' : String(t.hurdleIrrPct * 100), lp: String(t.lpSplit * 100), gp: String(t.gpSplit * 100) })));
  const [error, setError] = useState<string | null>(null);
  const update = (i: number, k: 'hurdle' | 'lp' | 'gp', v: string) => setRows((r) => r.map((row, j) => (i === j ? { ...row, [k]: v } : row)));
  const save = () => {
    const parsed: Tier[] = rows.map((r, i) => ({ hurdleIrrPct: i === rows.length - 1 ? null : Number(r.hurdle) / 100, lpSplit: Number(r.lp) / 100, gpSplit: Number(r.gp) / 100 }));
    for (const [i, t] of parsed.entries()) {
      if (Math.abs(t.lpSplit + t.gpSplit - 1) > 1e-6) return setError(`Tier ${i + 1} splits must sum to 100%.`);
      if (i < parsed.length - 1 && !(typeof t.hurdleIrrPct === 'number' && Number.isFinite(t.hurdleIrrPct))) return setError(`Tier ${i + 1} needs an IRR hurdle.`);
      if (i > 0 && i < parsed.length - 1 && (t.hurdleIrrPct ?? 0) < (parsed[i - 1]!.hurdleIrrPct ?? 0)) return setError('Hurdles must not decrease.');
    }
    setError(null);
    onSave(parsed);
  };
  return (
    <Card title="Waterfall tiers" className="mt-4">
      <p className="mb-2 text-xs text-neutral-500">IRR-hurdle tiers; the last tier takes the residual. Default: pro rata to 8%, then 70/30 to 15%, then 50/50.</p>
      <table className="w-full text-sm">
        <thead className="text-xs text-neutral-500">
          <tr>
            <th className="py-1 text-left font-medium">Tier</th>
            <th className="py-1 text-left font-medium">Hurdle IRR (%)</th>
            <th className="py-1 text-left font-medium">LP split (%)</th>
            <th className="py-1 text-left font-medium">GP split (%)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-neutral-100">
              <td className="py-1">{i + 1}</td>
              <td className="py-1 pr-2">
                <Input value={r.hurdle} onChange={(e) => update(i, 'hurdle', e.target.value)} disabled={i === rows.length - 1} placeholder={i === rows.length - 1 ? 'residual' : ''} className="h-8" aria-label={`Tier ${i + 1} hurdle`} />
              </td>
              <td className="py-1 pr-2">
                <Input value={r.lp} onChange={(e) => update(i, 'lp', e.target.value)} className="h-8" aria-label={`Tier ${i + 1} LP split`} />
              </td>
              <td className="py-1 pr-2">
                <Input value={r.gp} onChange={(e) => update(i, 'gp', e.target.value)} className="h-8" aria-label={`Tier ${i + 1} GP split`} />
              </td>
              <td className="py-1 text-right">
                {rows.length > 1 ? (
                  <Button variant="ghost" size="sm" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
                    ×
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      <div className="mt-2 flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setRows((x) => [...x.slice(0, -1), { hurdle: '', lp: '70', gp: '30' }, x[x.length - 1]!])}>
          Add tier
        </Button>
        <Button size="sm" onClick={save} data-testid="tiers-save">
          Save tiers
        </Button>
      </div>
    </Card>
  );
}
