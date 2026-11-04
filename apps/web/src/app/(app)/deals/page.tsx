import Link from 'next/link';
import { listDeals } from '@pencil/db';
import { Badge, Button, EmptyState, PageHeader } from '@/components/ui';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { cloneDeal, createFromTemplate } from '@/server/actions';

export default async function DealsPage() {
  const user = await requireUser();
  const db = await getDb();
  const deals = await listDeals(db, user.orgId);
  const templates = deals.filter((d) => d.isTemplate);
  return (
    <>
      <PageHeader
        title="Deals"
        subtitle={`${user.orgName} · ${deals.length} ${deals.length === 1 ? 'deal' : 'deals'}`}
        actions={
          <Link href="/deals/new" data-testid="new-deal">
            <Button>New from address</Button>
          </Link>
        }
      />
      {deals.length === 0 ? (
        <EmptyState title="No deals yet">
          Start from an address: Pencil looks up the town, fills the twelve inputs from benchmarks and shows a range of returns in under a minute.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-medium text-neutral-600">
              <tr>
                <th className="px-4 py-2">Deal</th>
                <th className="px-4 py-2">Town</th>
                <th className="px-4 py-2">Updated</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="border-t border-neutral-100" data-testid="deal-row">
                  <td className="px-4 py-2">
                    <Link href={`/deals/${d.id}/inputs`} className="font-medium text-neutral-900 hover:underline">
                      {d.name}
                    </Link>
                    {d.isTemplate ? (
                      <Badge tone="info" className="ml-2">
                        Template
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{d.town ?? '—'}</td>
                  <td className="px-4 py-2 text-neutral-600">{new Date(d.updatedAt).toLocaleDateString('en-US')}</td>
                  <td className="px-4 py-2 text-right">
                    <form
                      action={async () => {
                        'use server';
                        await cloneDeal(d.id);
                      }}
                      className="inline"
                    >
                      <Button type="submit" variant="ghost" size="sm" data-testid={`clone-${d.id}`}>
                        Clone
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {templates.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">Start from a template</h2>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <form
                key={t.id}
                action={async (formData) => {
                  'use server';
                  await createFromTemplate(t.id, String(formData.get('name') ?? `${t.name} (new)`));
                }}
                className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white p-2"
              >
                <span className="text-sm">{t.name}</span>
                <input name="name" placeholder="New deal name" className="h-8 rounded border border-neutral-300 px-2 text-sm" />
                <Button type="submit" size="sm" variant="secondary">
                  Create
                </Button>
              </form>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
