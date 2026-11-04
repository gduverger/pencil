import { redirect } from 'next/navigation';
import { getOrganization, listEntitlements } from '@pencil/db';
import { UpgradeButtons } from '@/components/billing/upgrade-buttons';
import { Badge, Button, Card, Input, Label, PageHeader } from '@/components/ui';
import { getDb } from '@/lib/db';
import { effectiveTier } from '@/lib/entitlements';
import { requireUser } from '@/lib/session';
import { updateOrgSettings } from '@/server/actions';
import { openBillingPortal } from '@/server/billing-actions';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const user = await requireUser();
  const { billing } = await searchParams;
  const db = await getDb();
  const [org, entitlements] = await Promise.all([
    getOrganization(db, user.orgId),
    listEntitlements(db, user.orgId),
  ]);
  const s = user.settings;
  const now = Date.now();
  const active = entitlements
    .filter((e) => !e.validUntil || new Date(e.validUntil).getTime() >= now)
    .sort((a, b) => (a.validUntil ?? '').localeCompare(b.validUntil ?? ''));
  const effective = effectiveTier(org.tier);
  return (
    <>
      <PageHeader
        title="Organization settings"
        subtitle={`${user.orgName} · ${org.tier} tier · you are ${user.role}`}
      />
      <div className="max-w-xl space-y-4">
        <Card
          title="Billing"
          actions={
            <Badge tone={effective === 'pro' ? 'good' : 'neutral'}>
              {effective === 'pro' ? 'Pro' : 'Free'}
            </Badge>
          }
        >
          {billing === 'success' ? (
            <p
              className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900"
              data-testid="billing-status"
            >
              Thank you. The purchase is applied as soon as Stripe confirms it, usually within
              seconds; reload if an export button is still locked.
            </p>
          ) : billing === 'cancel' ? (
            <p
              className="mb-3 rounded-md border border-neutral-200 bg-neutral-50 p-2 text-sm"
              data-testid="billing-status"
            >
              Checkout was cancelled; nothing was charged.
            </p>
          ) : null}
          <p className="text-sm">
            Tier:{' '}
            <span className="font-medium" data-testid="org-tier">
              {org.tier}
            </span>
            {effective !== org.tier ? (
              <span className="text-neutral-500"> (development default: {effective})</span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Free: unlimited deals and on-screen results. Per-deal ($199): exports and share links of
            one deal for 12 months. Pro ($2,400/year): everything for the organization, letterhead,
            templates and benchmark detail.
          </p>
          {active.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs" data-testid="entitlements">
              {active.map((e) => (
                <li key={e.id}>
                  <Badge tone="info">{e.kind}</Badge>{' '}
                  {e.dealId ? `deal ${e.dealId.slice(0, 8)}…` : 'organization'} · valid until{' '}
                  {e.validUntil ? e.validUntil.slice(0, 10) : 'no expiry'}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-neutral-500" data-testid="entitlements">
              No purchases yet.
            </p>
          )}
          <div className="mt-3">
            <UpgradeButtons showPerDeal={false} />
          </div>
          {org.stripeCustomerId && user.role === 'owner' ? (
            <form
              className="mt-2"
              action={async () => {
                'use server';
                const r = await openBillingPortal();
                if (r.ok) redirect(r.url);
              }}
            >
              <Button type="submit" variant="secondary" size="sm">
                Manage billing (invoices, cancel)
              </Button>
            </form>
          ) : null}
          <p className="mt-3 text-[11px] text-neutral-400">
            Organization id <code data-testid="org-id">{org.id}</code> — quote it to support.
          </p>
        </Card>
        <form
          className="space-y-4"
          action={async (formData) => {
            'use server';
            const num = (k: string) => {
              const v = String(formData.get(k) ?? '').trim();
              return v === '' ? undefined : Number(v);
            };
            await updateOrgSettings({
              name: String(formData.get('name') ?? '').trim() || undefined,
              settings: {
                letterheadName: String(formData.get('letterheadName') ?? '').trim() || undefined,
                letterheadAddress:
                  String(formData.get('letterheadAddress') ?? '').trim() || undefined,
                defaultHoldMonths: num('defaultHoldMonths'),
                rounding: { usdThousandsFrom: num('usdThousandsFrom') ?? 100000 },
                scenarioDeltas: {
                  rentPct: (num('rentPct') ?? 5) / 100,
                  hardCostPct: (num('hardCostPct') ?? 10) / 100,
                },
                contributeBenchmarks: formData.get('contributeBenchmarks') === 'on',
              },
            });
          }}
        >
          <Card title="Organization">
            <div className="space-y-3">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={user.orgName}
                  disabled={user.role !== 'owner'}
                />
              </div>
              <div>
                <Label htmlFor="letterheadName">Letterhead name</Label>
                <Input
                  id="letterheadName"
                  name="letterheadName"
                  defaultValue={s.letterheadName ?? ''}
                  placeholder="Shown on every package page"
                />
              </div>
              <div>
                <Label htmlFor="letterheadAddress">Letterhead address</Label>
                <Input
                  id="letterheadAddress"
                  name="letterheadAddress"
                  defaultValue={s.letterheadAddress ?? ''}
                />
              </div>
            </div>
          </Card>
          <Card title="Defaults">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="defaultHoldMonths">Default hold (months)</Label>
                <Input
                  id="defaultHoldMonths"
                  name="defaultHoldMonths"
                  type="number"
                  defaultValue={s.defaultHoldMonths ?? 120}
                />
              </div>
              <div>
                <Label htmlFor="usdThousandsFrom">Round to $1,000 from</Label>
                <Input
                  id="usdThousandsFrom"
                  name="usdThousandsFrom"
                  type="number"
                  defaultValue={s.rounding?.usdThousandsFrom ?? 100000}
                />
              </div>
              <div>
                <Label htmlFor="rentPct">Best/Worst rent delta (%)</Label>
                <Input
                  id="rentPct"
                  name="rentPct"
                  type="number"
                  step="0.5"
                  defaultValue={((s.scenarioDeltas?.rentPct ?? 0.05) * 100).toString()}
                />
              </div>
              <div>
                <Label htmlFor="hardCostPct">Best/Worst hard cost delta (%)</Label>
                <Input
                  id="hardCostPct"
                  name="hardCostPct"
                  type="number"
                  step="0.5"
                  defaultValue={((s.scenarioDeltas?.hardCostPct ?? 0.1) * 100).toString()}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              The default waterfall is pro rata to 8%, then 70/30 to 15%, then 50/50 (spec 14.2);
              edit tiers per deal on the Inputs screen.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                id="contributeBenchmarks"
                name="contributeBenchmarks"
                type="checkbox"
                className="h-4 w-4"
                defaultChecked={s.contributeBenchmarks ?? false}
              />
              <Label htmlFor="contributeBenchmarks">
                Contribute anonymized values to the Massachusetts benchmark table on export (no
                address, name or notes)
              </Label>
            </div>
          </Card>
          <Button type="submit" disabled={user.role !== 'owner'}>
            Save settings
          </Button>
        </form>
      </div>
    </>
  );
}
