'use client';

/** The guided-intake panel (10.1): a conversation whose proposals the user confirms one by one. */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SetInputCall } from '@pencil/assistant';
import type { TranscriptMessage } from '@pencil/db/state';
import { catalogEntry } from '@pencil/engine';
import { Badge, Button, Card, Textarea } from '@/components/ui';
import { applyAssistantProposals, assistantMessage } from '@/server/assistant-actions';
import { toDisplay, unitLabel } from '@/components/inputs/format';

interface Pending {
  messageId: string;
  proposals: SetInputCall[];
}

export function AssistantPanel({
  dealId,
  rev: initialRev,
  transcript: initialTranscript,
  available,
  onApplied,
}: {
  dealId: string;
  rev: number;
  transcript: TranscriptMessage[];
  available: boolean;
  onApplied?: (rev: number) => void;
}) {
  const router = useRouter();
  const [rev, setRev] = useState(initialRev);
  const [transcript, setTranscript] = useState(initialTranscript);
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const userText = text.trim();
    setText('');
    setTranscript((t) => [
      ...t,
      { id: `local-${Date.now()}`, role: 'user', text: userText, at: new Date().toISOString() },
    ]);
    const r = await assistantMessage(dealId, rev, userText);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setRev(r.rev);
    setTranscript((t) => [...t, r.message]);
    setWarning(r.warning);
    setPending(r.proposals.length > 0 ? { messageId: r.message.id, proposals: r.proposals } : null);
  };

  const apply = async (proposals: SetInputCall[]) => {
    if (!pending) return;
    setBusy(true);
    const r = await applyAssistantProposals(dealId, rev, pending.messageId, proposals);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setRev(r.rev);
    const applied = proposals.map((p) => ({
      path: p.path,
      value: p.value,
      source: p.source,
      note: p.note,
    }));
    setTranscript((t) =>
      t.map((m) =>
        m.id === pending.messageId ? { ...m, applied: [...(m.applied ?? []), ...applied] } : m,
      ),
    );
    setPending((p) =>
      p ? { ...p, proposals: p.proposals.filter((x) => !proposals.includes(x)) } : null,
    );
    onApplied?.(r.rev);
    router.refresh();
  };

  return (
    <Card
      title="Assistant"
      actions={
        <span className="text-[11px] text-neutral-500">
          {available
            ? 'drafts are labeled; nothing is written without your confirmation'
            : 'not configured'}
        </span>
      }
    >
      <div
        className="max-h-80 space-y-2 overflow-y-auto text-sm"
        data-testid="assistant-transcript"
      >
        {transcript.length === 0 ? (
          <p className="text-neutral-500">
            Tell the assistant about the site, the program and any numbers you already have. It asks
            only for what benchmarks cannot default and proposes inputs for you to confirm.
          </p>
        ) : null}
        {transcript.map((m) => (
          <div
            key={m.id}
            className={
              m.role === 'user'
                ? 'rounded-md bg-neutral-100 p-2'
                : 'rounded-md border border-neutral-200 p-2'
            }
            data-testid={`assistant-${m.role}`}
          >
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
              {m.role === 'user' ? 'You' : 'Assistant (drafted)'}
            </div>
            <div className="whitespace-pre-wrap">{m.text}</div>
            {m.applied && m.applied.length > 0 ? (
              <div className="mt-1 text-[11px] text-emerald-700">
                Applied: {m.applied.map((a) => catalogEntry(a.path)?.label ?? a.path).join(', ')}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {pending && pending.proposals.length > 0 ? (
        <div
          className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-2"
          data-testid="assistant-proposals"
        >
          <div className="mb-1 text-xs font-medium text-blue-900">
            Proposed inputs — confirm to apply
          </div>
          <ul className="space-y-1 text-xs">
            {pending.proposals.map((p, i) => {
              const entry = catalogEntry(p.path);
              return (
                <li
                  key={`${p.path}-${i}`}
                  className="flex items-center justify-between gap-2"
                  data-testid={`proposal-${p.path}`}
                >
                  <span>
                    <span className="font-medium">{entry?.label ?? p.path}</span>:{' '}
                    {toDisplay(p.value, entry?.unit ?? 'usd')} {unitLabel(entry?.unit ?? 'usd')}{' '}
                    <Badge tone="neutral">{p.source}</Badge>
                    {p.note ? <span className="text-neutral-500"> · {p.note}</span> : null}
                  </span>
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={() => apply([p])}
                      disabled={busy}
                      data-testid={`apply-${p.path}`}
                    >
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setPending((x) =>
                          x ? { ...x, proposals: x.proposals.filter((y) => y !== p) } : null,
                        )
                      }
                    >
                      Dismiss
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
          {pending.proposals.length > 1 ? (
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => apply(pending.proposals)}
              disabled={busy}
              data-testid="apply-all"
            >
              Apply all
            </Button>
          ) : null}
        </div>
      ) : null}
      {warning ? <p className="mt-2 text-xs text-amber-800">{warning}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={
            available
              ? 'e.g. 60 units wood frame, land $3,000,000, GC says $320/SF'
              : 'Assistant not configured'
          }
          disabled={!available || busy}
          data-testid="assistant-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button
          onClick={send}
          disabled={!available || busy || !text.trim()}
          data-testid="assistant-send"
        >
          {busy ? '…' : 'Send'}
        </Button>
      </div>
    </Card>
  );
}
