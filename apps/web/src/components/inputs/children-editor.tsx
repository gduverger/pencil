'use client';

import { useState } from 'react';
import type { ChildLine } from '@pencil/db/state';
import { SOURCES, type Source, type Unit } from '@pencil/engine';
import { Button, Input, Select } from '@/components/ui';
import { fromDisplay, toDisplay, unitLabel } from './format';

export function ChildrenEditor({
  path,
  children,
  unit,
  onAdd,
  onUpdate,
  onDelete,
}: {
  path: string;
  children: ChildLine[];
  unit: Unit;
  onAdd: (child: { label: string; amount: number; source: Source; note: string }) => void;
  onUpdate: (
    id: string,
    changes: { label?: string; amount?: number; source?: Source; note?: string },
  ) => void;
  onDelete: (id: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<Source>('quote');
  const [note, setNote] = useState('');
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const total = children.reduce((s, c) => s + c.amount, 0);
  const submit = () => {
    const n = fromDisplay(amount, unit);
    if (!label.trim() || typeof n !== 'number') return;
    onAdd({ label: label.trim(), amount: n, source, note });
    setLabel('');
    setAmount('');
    setNote('');
  };
  const applyPaste = () => {
    // One line per child: "label<TAB>amount", "label,amount" or just "amount".
    const lines = paste
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    lines.forEach((line, i) => {
      const parts = line.split(/\t|,(?=\s*[-$\d])/).map((p) => p.trim());
      const amountText = parts[parts.length - 1] ?? '';
      const n = fromDisplay(amountText, unit);
      if (typeof n !== 'number') return;
      const lbl =
        parts.length > 1 ? parts.slice(0, -1).join(', ') : `Line ${children.length + i + 1}`;
      onAdd({ label: lbl, amount: n, source: 'quote', note: 'Pasted' });
    });
    setPaste('');
    setShowPaste(false);
  };
  return (
    <div
      className="mt-2 rounded-md border border-neutral-200 bg-neutral-50 p-3"
      data-testid={`children-${path}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-700">
          Children sum to the parent · total {unit === 'usd' ? '$' : ''}
          {toDisplay(total, unit)} {unit !== 'usd' ? unitLabel(unit) : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setShowPaste((v) => !v)}>
          Paste a column
        </Button>
      </div>
      {showPaste ? (
        <div className="mb-2 flex gap-2">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={4}
            className="w-full rounded border border-neutral-300 p-2 font-mono text-xs"
            placeholder={'Sitework\t2000000\nStructure\t10000000'}
            data-testid="paste-area"
          />
          <Button size="sm" onClick={applyPaste} data-testid="paste-apply">
            Add lines
          </Button>
        </div>
      ) : null}
      <table className="w-full text-xs">
        <thead className="text-neutral-500">
          <tr>
            <th className="py-1 text-left font-medium">Line</th>
            <th className="py-1 text-right font-medium">Amount ({unitLabel(unit)})</th>
            <th className="py-1 text-left font-medium">Source</th>
            <th className="py-1 text-left font-medium">Note</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {children.map((c) => (
            <tr key={c.id} className="border-t border-neutral-200" data-testid="child-row">
              <td className="py-1 pr-2">
                <Input
                  defaultValue={c.label}
                  className="h-7 text-xs"
                  onBlur={(e) =>
                    e.target.value !== c.label && onUpdate(c.id, { label: e.target.value })
                  }
                  aria-label="Child label"
                />
                {c.remainder ? (
                  <span className="text-[10px] text-neutral-500">auto-balancing remainder</span>
                ) : null}
              </td>
              <td className="py-1 pr-2 text-right">
                <Input
                  defaultValue={toDisplay(c.amount, unit)}
                  className="h-7 text-right text-xs tabular"
                  aria-label="Child amount"
                  data-testid="child-amount"
                  onBlur={(e) => {
                    const n = fromDisplay(e.target.value, unit);
                    if (typeof n === 'number' && n !== c.amount) onUpdate(c.id, { amount: n });
                  }}
                />
              </td>
              <td className="py-1 pr-2">
                <Select
                  value={c.source}
                  className="h-7 text-xs"
                  onChange={(e) => onUpdate(c.id, { source: e.target.value as Source })}
                  aria-label="Child source"
                >
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </td>
              <td className="py-1 pr-2">
                <Input
                  defaultValue={c.note}
                  className="h-7 text-xs"
                  onBlur={(e) =>
                    e.target.value !== c.note && onUpdate(c.id, { note: e.target.value })
                  }
                  aria-label="Child note"
                />
              </td>
              <td className="py-1 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(c.id)}
                  aria-label={`Delete ${c.label}`}
                >
                  ×
                </Button>
              </td>
            </tr>
          ))}
          <tr className="border-t border-neutral-200">
            <td className="py-1 pr-2">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="New line"
                className="h-7 text-xs"
                data-testid="child-label-new"
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </td>
            <td className="py-1 pr-2">
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-7 text-right text-xs tabular"
                data-testid="child-amount-new"
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </td>
            <td className="py-1 pr-2">
              <Select
                value={source}
                className="h-7 text-xs"
                onChange={(e) => setSource(e.target.value as Source)}
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </td>
            <td className="py-1 pr-2">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note"
                className="h-7 text-xs"
              />
            </td>
            <td className="py-1 text-right">
              <Button size="sm" onClick={submit} data-testid="child-add">
                Add
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
