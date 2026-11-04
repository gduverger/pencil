import { Button, Card, Input, Label, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/session';
import { updateOrgSettings } from '@/server/actions';

export default async function SettingsPage() {
  const user = await requireUser();
  const s = user.settings;
  return (
    <>
      <PageHeader title="Organization settings" subtitle={`${user.orgName} · ${user.tier} tier · you are ${user.role}`} />
      <form
        className="max-w-xl space-y-4"
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
              letterheadAddress: String(formData.get('letterheadAddress') ?? '').trim() || undefined,
              defaultHoldMonths: num('defaultHoldMonths'),
              rounding: { usdThousandsFrom: num('usdThousandsFrom') ?? 100000 },
              scenarioDeltas: { rentPct: (num('rentPct') ?? 5) / 100, hardCostPct: (num('hardCostPct') ?? 10) / 100 },
              contributeBenchmarks: formData.get('contributeBenchmarks') === 'on',
            },
          });
        }}
      >
        <Card title="Organization">
          <div className="space-y-3">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={user.orgName} disabled={user.role !== 'owner'} />
            </div>
            <div>
              <Label htmlFor="letterheadName">Letterhead name</Label>
              <Input id="letterheadName" name="letterheadName" defaultValue={s.letterheadName ?? ''} placeholder="Shown on every package page" />
            </div>
            <div>
              <Label htmlFor="letterheadAddress">Letterhead address</Label>
              <Input id="letterheadAddress" name="letterheadAddress" defaultValue={s.letterheadAddress ?? ''} />
            </div>
          </div>
        </Card>
        <Card title="Defaults">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="defaultHoldMonths">Default hold (months)</Label>
              <Input id="defaultHoldMonths" name="defaultHoldMonths" type="number" defaultValue={s.defaultHoldMonths ?? 120} />
            </div>
            <div>
              <Label htmlFor="usdThousandsFrom">Round to $1,000 from</Label>
              <Input id="usdThousandsFrom" name="usdThousandsFrom" type="number" defaultValue={s.rounding?.usdThousandsFrom ?? 100000} />
            </div>
            <div>
              <Label htmlFor="rentPct">Best/Worst rent delta (%)</Label>
              <Input id="rentPct" name="rentPct" type="number" step="0.5" defaultValue={((s.scenarioDeltas?.rentPct ?? 0.05) * 100).toString()} />
            </div>
            <div>
              <Label htmlFor="hardCostPct">Best/Worst hard cost delta (%)</Label>
              <Input id="hardCostPct" name="hardCostPct" type="number" step="0.5" defaultValue={((s.scenarioDeltas?.hardCostPct ?? 0.1) * 100).toString()} />
            </div>
          </div>
          <p className="mt-2 text-xs text-neutral-500">The default waterfall is pro rata to 8%, then 70/30 to 15%, then 50/50 (spec 14.2); edit tiers per deal on the Inputs screen.</p>
          <div className="mt-3 flex items-center gap-2">
            <input id="contributeBenchmarks" name="contributeBenchmarks" type="checkbox" className="h-4 w-4" defaultChecked={s.contributeBenchmarks ?? false} />
            <Label htmlFor="contributeBenchmarks">Contribute anonymized values to the Massachusetts benchmark table on export (no address, name or notes)</Label>
          </div>
        </Card>
        <Button type="submit" disabled={user.role !== 'owner'}>
          Save settings
        </Button>
      </form>
    </>
  );
}
