'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from './ui';

const TABS = [
  { key: 'setup', label: 'Setup' },
  { key: 'inputs', label: 'Inputs' },
  { key: 'results', label: 'Results' },
  { key: 'package', label: 'Package' },
];

export function DealTabs({ dealId }: { dealId: string }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 rounded-md bg-neutral-100 p-0.5" aria-label="Deal screens">
      {TABS.map((t) => {
        const href = `/deals/${dealId}/${t.key}`;
        const active = path?.startsWith(href);
        return (
          <Link key={t.key} href={href} data-testid={`tab-${t.key}`} className={cn('rounded px-3 py-1 text-sm', active ? 'bg-white font-medium text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900')}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
