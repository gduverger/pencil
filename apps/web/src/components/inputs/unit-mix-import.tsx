'use client';

import { useState } from 'react';
import type { InputPatch } from '@pencil/db/state';
import { Button, Card } from '@/components/ui';

/** CSV import of a unit mix: `key,mixPct,avgSF,rentPerMonth` per line (mix as 40 or 0.4). */
export function parseUnitMixCsv(text: string): { patches: InputPatch[]; errors: string[] } {
  const patches: InputPatch[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const [keyRaw, mixRaw, sfRaw, rentRaw] = line.split(/[,\t;]/).map((p) => p.trim());
    const key = (keyRaw ?? '').toLowerCase().replace(/\s/g, '');
    const normalized = key === 'studio' || key === '0br' ? 'studio' : key === '1br' || key === '1' ? '1BR' : key === '2br' || key === '2' ? '2BR' : key === '3br' || key === '3' ? '3BR' : null;
    if (!normalized) {
      if (/^(key|type|unit)/i.test(keyRaw ?? '')) continue; // header
      errors.push(`Unknown unit type "${keyRaw}" (use studio, 1BR, 2BR, 3BR)`);
      continue;
    }
    const mix = Number(mixRaw?.replace('%', ''));
    const sf = Number(sfRaw);
    const rent = Number(rentRaw?.replace(/[$,]/g, ''));
    if (!Number.isFinite(mix) || !Number.isFinite(sf) || !Number.isFinite(rent)) {
      errors.push(`Line "${line}" needs mix, average SF and rent`);
      continue;
    }
    patches.push({ scenario: 'likely', path: `program.unitTypes[${normalized}].mixPct`, value: mix > 1 ? mix / 100 : mix, source: 'my-number', note: 'CSV import' });
    patches.push({ scenario: 'likely', path: `program.unitTypes[${normalized}].avgSF`, value: sf, source: 'my-number', note: 'CSV import' });
    patches.push({ scenario: 'likely', path: `program.unitTypes[${normalized}].rentPerMonth`, value: rent, source: 'my-number', note: 'CSV import' });
  }
  return { patches, errors };
}

export function UnitMixImport({ onImport }: { onImport: (patches: InputPatch[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <Card title="Unit mix import" className="mt-4" actions={<Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Show'}</Button>}>
      {open ? (
        <div className="space-y-2">
          <p className="text-xs text-neutral-500">One line per unit type: key, share of units (%), average SF, rent per month.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="w-full rounded border border-neutral-300 p-2 font-mono text-xs" placeholder={'studio,10,450,2200\n1BR,40,650,2700\n2BR,40,950,3300\n3BR,10,1200,3900'} data-testid="unit-mix-text" />
          {errors.length > 0 ? (
            <ul className="text-xs text-red-700">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : null}
          <Button
            size="sm"
            onClick={() => {
              const r = parseUnitMixCsv(text);
              setErrors(r.errors);
              if (r.patches.length > 0) {
                onImport(r.patches);
                setText('');
              }
            }}
            data-testid="unit-mix-apply"
          >
            Import
          </Button>
        </div>
      ) : (
        <p className="text-xs text-neutral-500">Paste a CSV of unit types to set mix, sizes and rents at once.</p>
      )}
    </Card>
  );
}
