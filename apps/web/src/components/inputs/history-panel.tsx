'use client';

import { useEffect, useState } from 'react';
import { listHistory } from '@/server/actions';
import { Button } from '@/components/ui';

interface Row {
  id: string;
  scenario: string;
  path: string;
  priorValue: unknown;
  priorSource: string | null;
  priorNote: string | null;
  changedBy: string;
  changedAt: string;
}

export function HistoryPanel({ dealId, path, label, onClose }: { dealId: string; path: string; label: string; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    listHistory(dealId, path).then(setRows).catch(() => setRows([]));
  }, [dealId, path]);
  return (
    <div className="fixed inset-y-0 right-0 z-20 w-full max-w-md overflow-y-auto border-l border-neutral-200 bg-white p-4 shadow-xl" role="dialog" aria-label={`History of ${label}`} data-testid="history-panel">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">History — {label}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <p className="mb-3 text-xs text-neutral-500">Every change appends the prior value; nothing is overwritten. Newest first.</p>
      {rows === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No history yet.</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded border border-neutral-200 p-2 text-xs" data-testid="history-row">
              <div className="flex justify-between text-neutral-500">
                <span>{new Date(r.changedAt).toLocaleString('en-US')}</span>
                <span>{r.scenario}</span>
              </div>
              <div className="mt-1">
                <span className="font-medium">Prior value:</span> {r.priorValue === null ? '—' : typeof r.priorValue === 'object' ? JSON.stringify(r.priorValue) : String(r.priorValue)}
              </div>
              <div>
                <span className="font-medium">Source:</span> {r.priorSource ?? '—'}
                {r.priorNote ? (
                  <>
                    {' · '}
                    <span className="font-medium">Note:</span> {r.priorNote}
                  </>
                ) : null}
              </div>
              <div className="text-neutral-500">by {r.changedBy}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
