'use client';

import { explain, type DealOutputs } from '@pencil/engine';
import { formatByUnit } from '@pencil/package-pages';
import { Button } from '@/components/ui';

/** Explain-this-number (10.2): the engine's derivation trace as data; the assistant's sentences arrive with M9. */
export function ExplainPanel({ outputs, cellRef, onClose }: { outputs: DealOutputs; cellRef: string; onClose: () => void }) {
  const trace = explain(outputs, cellRef);
  const unit = trace.unit === 'rate_pct' && cellRef.includes('Irr') ? 'irr' : trace.unit;
  return (
    <div className="fixed inset-y-0 right-0 z-20 w-full max-w-md overflow-y-auto border-l border-neutral-200 bg-white p-4 shadow-xl" role="dialog" aria-label={`Explain ${trace.label}`} data-testid="explain-panel">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{trace.label}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <p className="text-lg font-semibold tabular" data-testid="explain-value">
        {typeof trace.value === 'number' ? formatByUnit(trace.value, unit as never) : String(trace.value ?? '—')}
      </p>
      <p className="mt-2 rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-700">{trace.formula}</p>
      {trace.operands.length > 0 ? (
        <table className="mt-3 w-full text-xs">
          <tbody>
            {trace.operands.map((op, i) => (
              <tr key={i} className="border-t border-neutral-100">
                <td className="py-1 pr-2 text-neutral-600">{op.name}</td>
                <td className="py-1 text-right tabular">{typeof op.value === 'number' ? formatByUnit(op.value, (op.unit ?? 'usd') as never) : String(op.value ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {trace.notes.length > 0 ? (
        <ul className="mt-3 list-disc pl-5 text-xs text-neutral-600">
          {trace.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-4 text-[11px] text-neutral-400">Trace from the engine; the number comes from the same calculation as every page.</p>
    </div>
  );
}
