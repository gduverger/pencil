'use client';

/** 10.3: each engine or benchmark flag as one plain sentence, fetched on demand. */
import { useState } from 'react';
import type { ScenarioKey } from '@pencil/engine';
import { Button } from '@/components/ui';
import { flagSentences } from '@/server/assistant-actions';

export function ReviewerNotes({ dealId, scenario, rev }: { dealId: string; scenario: ScenarioKey; rev: number }) {
  const [notes, setNotes] = useState<{ rev: number; items: Array<{ code: string; text: string; drafted: boolean }> } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        data-testid="reviewer-notes"
        onClick={async () => {
          setBusy(true);
          const r = await flagSentences(dealId, scenario);
          setBusy(false);
          if (r.ok) setNotes({ rev, items: r.sentences });
        }}
      >
        {busy ? 'Checking…' : 'Reviewer notes'}
      </Button>
      {notes ? (
        notes.items.length === 0 ? (
          <p className="mt-1 text-xs text-neutral-500" data-testid="reviewer-empty">No flags for the {scenario} scenario.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-xs" data-testid="reviewer-list">
            {notes.items.map((n, i) => (
              <li key={i} className="text-amber-900">
                {n.text} {n.drafted ? <span className="text-[10px] text-neutral-400">(drafted by the assistant)</span> : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
