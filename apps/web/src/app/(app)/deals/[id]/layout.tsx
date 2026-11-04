import Link from 'next/link';
import type { ReactNode } from 'react';
import { getDeal } from '@pencil/db';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { DealTabs } from '@/components/deal-tabs';

export default async function DealLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const db = await getDb();
  const { deal } = await getDeal(db, user.orgId, id);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/deals" className="text-xs text-neutral-500 hover:text-neutral-800">
            ← Deals
          </Link>
          <h1 className="text-lg font-semibold" data-testid="deal-title">
            {deal.name}
          </h1>
        </div>
        <DealTabs dealId={id} />
      </div>
      {children}
    </div>
  );
}
