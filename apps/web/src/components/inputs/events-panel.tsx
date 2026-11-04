'use client';

import { useState } from 'react';
import type { DealEventRecord } from '@pencil/db/state';
import { Button, Card, Input, Select } from '@/components/ui';
import { formatUsd } from '@pencil/package-pages';

type Kind = 'cost' | 'inflow';
type Category = 'land' | 'hard' | 'soft' | 'other' | 'inflow';

export function EventsPanel({
  events,
  onSave,
  onDelete,
}: {
  events: DealEventRecord[];
  onSave: (e: {
    id?: string;
    label: string;
    month: number;
    amount: number;
    kind: Kind;
    category: Category;
    note: string;
  }) => void;
  onDelete: (id: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [month, setMonth] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<Kind>('cost');
  const [category, setCategory] = useState<Category>('other');
  const [note, setNote] = useState('');
  const submit = () => {
    const m = Number(month);
    const a = Number(String(amount).replace(/[$,\s]/g, ''));
    if (!label.trim() || !Number.isInteger(m) || m < 0 || !Number.isFinite(a) || a < 0) return;
    onSave({
      label: label.trim(),
      month: m,
      amount: a,
      kind,
      category: kind === 'inflow' ? 'inflow' : category,
      note,
    });
    setLabel('');
    setMonth('');
    setAmount('');
    setNote('');
  };
  return (
    <Card title="Events" className="mt-4">
      <p className="mb-2 text-xs text-neutral-500">
        One-off costs and inflows at a specific month: a relocated house, a grant, a sale of surplus
        land. Cost events are funded in order; inflows reduce the requirement in their month.
      </p>
      {events.length > 0 ? (
        <table className="mb-3 w-full text-sm">
          <thead className="text-xs text-neutral-500">
            <tr>
              <th className="py-1 text-left font-medium">Event</th>
              <th className="py-1 text-left font-medium">Month</th>
              <th className="py-1 text-right font-medium">Amount</th>
              <th className="py-1 text-left font-medium">Kind</th>
              <th className="py-1 text-left font-medium">Category</th>
              <th className="py-1 text-left font-medium">Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-neutral-100" data-testid="event-row">
                <td className="py-1">{e.label}</td>
                <td className="py-1">{e.month}</td>
                <td className="py-1 text-right tabular">{formatUsd(e.amount)}</td>
                <td className="py-1">{e.kind}</td>
                <td className="py-1">{e.category}</td>
                <td className="py-1 text-neutral-600">{e.note}</td>
                <td className="py-1 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(e.id)}
                    aria-label={`Delete ${e.label}`}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label"
          className="sm:col-span-2"
          data-testid="event-label"
        />
        <Input
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          placeholder="Month"
          type="number"
          min={0}
          data-testid="event-month"
        />
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          data-testid="event-amount"
        />
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
          data-testid="event-kind"
        >
          <option value="cost">cost</option>
          <option value="inflow">inflow</option>
        </Select>
        <Select
          value={kind === 'inflow' ? 'inflow' : category}
          disabled={kind === 'inflow'}
          onChange={(e) => setCategory(e.target.value as Category)}
          data-testid="event-category"
        >
          {(['land', 'hard', 'soft', 'other', 'inflow'] as const).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Button onClick={submit} data-testid="event-add">
          Add event
        </Button>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (why, from where)"
          className="col-span-2 sm:col-span-7"
          data-testid="event-note"
        />
      </div>
    </Card>
  );
}
