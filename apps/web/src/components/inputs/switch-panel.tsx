'use client';

import type { SwitchDefinition, SwitchKey } from '@pencil/db/state';
import { Card } from '@/components/ui';

export function SwitchPanel({ switches, state, onToggle }: { switches: SwitchDefinition[]; state: Record<SwitchKey, boolean>; onToggle: (key: SwitchKey, on: boolean) => void }) {
  return (
    <Card title="Switches">
      <ul className="space-y-2">
        {switches.map((s) => (
          <li key={s.key} className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{s.label}</div>
              <div className="text-xs text-neutral-500">{s.description}</div>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="h-4 w-4" checked={state[s.key]} disabled={s.fixed} onChange={(e) => onToggle(s.key, e.target.checked)} data-testid={`switch-${s.key}`} aria-label={s.label} />
              {s.fixed ? 'always on' : state[s.key] ? 'on' : 'off'}
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-neutral-500">Off removes a component from every calculation and page; its values are kept for when it is turned back on.</p>
    </Card>
  );
}
