import { CONSTRUCTION_TYPES } from '@pencil/benchmarks';
import { Button, Card, Input, Label, PageHeader, Select } from '@/components/ui';
import { requireUser } from '@/lib/session';
import { createDealFromAddress } from '@/server/actions';
import type { ConstructionType } from '@pencil/benchmarks';

export default async function NewDealPage() {
  await requireUser();
  return (
    <>
      <PageHeader
        title="New deal from address"
        subtitle="Pencil looks up the town, defaults the twelve inputs from benchmarks and opens the Inputs screen."
      />
      <form
        className="max-w-xl space-y-4"
        action={async (formData) => {
          'use server';
          const units = String(formData.get('totalUnits') ?? '').trim();
          const land = String(formData.get('landCost') ?? '').trim();
          await createDealFromAddress({
            name: String(formData.get('name') ?? ''),
            address: String(formData.get('address') ?? ''),
            constructionType: String(
              formData.get('constructionType') ?? 'wood-frame',
            ) as ConstructionType,
            ...(units ? { totalUnits: Number(units) } : {}),
            ...(land ? { landCost: Number(land) } : {}),
            landOwned: formData.get('landOwned') === 'on',
          });
        }}
      >
        <Card title="Site">
          <div className="space-y-3">
            <div>
              <Label htmlFor="address">Street address</Label>
              <Input
                id="address"
                name="address"
                required
                placeholder="120 Highland Avenue, Needham, MA 02494"
                data-testid="address"
              />
              <p className="mt-1 text-xs text-neutral-500">
                Massachusetts only. The town sets the benchmark cluster and the property tax rate.
              </p>
            </div>
            <div>
              <Label htmlFor="name">Deal name (optional)</Label>
              <Input
                id="name"
                name="name"
                placeholder="Defaults to the street address"
                data-testid="deal-name"
              />
            </div>
          </div>
        </Card>
        <Card title="Program">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="constructionType">Construction type</Label>
              <Select
                id="constructionType"
                name="constructionType"
                defaultValue="wood-frame"
                className="w-full"
                data-testid="construction-type"
              >
                {CONSTRUCTION_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="totalUnits">Total units (optional)</Label>
              <Input
                id="totalUnits"
                name="totalUnits"
                type="number"
                min={20}
                max={300}
                placeholder="60"
                data-testid="total-units"
              />
            </div>
            <div>
              <Label htmlFor="landCost">Land cost (optional)</Label>
              <Input
                id="landCost"
                name="landCost"
                type="number"
                min={0}
                step={1000}
                placeholder="3000000"
                data-testid="land-cost"
              />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <input id="landOwned" name="landOwned" type="checkbox" className="h-4 w-4" />
              <Label htmlFor="landOwned">Land already owned (contributed in kind)</Label>
            </div>
          </div>
        </Card>
        <Button type="submit" data-testid="create-deal">
          Create deal
        </Button>
      </form>
    </>
  );
}
