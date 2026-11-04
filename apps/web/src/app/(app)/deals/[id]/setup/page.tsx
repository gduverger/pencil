import { getDeal } from '@pencil/db';
import { formatInteger, formatUsd } from '@pencil/package-pages';
import { Badge, Button, Card, Input, Label } from '@/components/ui';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { deleteDeal, markTemplate, renameDeal } from '@/server/actions';

export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const db = await getDb();
  const { deal, state } = await getDeal(db, user.orgId, id);
  const s = state.setup;
  const fact = (label: string, value: string | null, source: 'parcel-data' | 'unknown') => (
    <div className="flex items-center justify-between gap-3 border-b border-neutral-100 py-1.5 text-sm">
      <span className="text-neutral-600">{label}</span>
      <span className="flex items-center gap-2">
        <span className="tabular">{value ?? '—'}</span>
        <Badge tone={source === 'parcel-data' ? 'good' : 'neutral'}>{source === 'parcel-data' ? 'parcel data' : 'unknown'}</Badge>
      </span>
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Site and parcel">
        <p className="mb-2 text-sm">{s.address || deal.name}</p>
        {fact('Town', s.town, s.town ? 'parcel-data' : 'unknown')}
        {fact('Benchmark cluster', s.townCluster, s.townCluster ? 'parcel-data' : 'unknown')}
        {fact('Lot area', s.parcel.lotSF === null ? null : `${formatInteger(s.parcel.lotSF)} SF`, s.parcel.lotSF === null ? 'unknown' : 'parcel-data')}
        {fact('Zoning district', s.parcel.zoningDistrict, s.parcel.zoningDistrict === null ? 'unknown' : 'parcel-data')}
        {fact('MBTA Communities district', s.parcel.mbtaCommunitiesDistrict === null ? null : s.parcel.mbtaCommunitiesDistrict ? 'Yes' : 'No', s.parcel.mbtaCommunitiesDistrict === null ? 'unknown' : 'parcel-data')}
        {fact('Assessed value', s.parcel.assessedValue === null ? null : formatUsd(s.parcel.assessedValue), s.parcel.assessedValue === null ? 'unknown' : 'parcel-data')}
        {fact('Current annual tax', s.parcel.annualTax === null ? null : formatUsd(s.parcel.annualTax), s.parcel.annualTax === null ? 'unknown' : 'parcel-data')}
        {fact('By-right envelope', s.parcel.unitsByRight === null ? null : `${s.parcel.unitsByRight} units`, s.parcel.unitsByRight === null ? 'unknown' : 'parcel-data')}
        {fact('Construction type', s.constructionType, 'parcel-data')}
        {s.parcel.notes.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-neutral-600" data-testid="lookup-notes">
            {s.parcel.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-xs text-neutral-500">Looked up {s.parcel.lookupDate ?? '—'}. Lot area, zoning, assessed value and tax are editable on the Inputs screen; their source stays with the value.</p>
      </Card>
      <div className="space-y-4">
        <Card title="Deal">
          <form
            className="flex items-end gap-2"
            action={async (formData) => {
              'use server';
              await renameDeal(id, String(formData.get('name') ?? ''));
            }}
          >
            <div className="flex-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={deal.name} />
            </div>
            <Button type="submit" variant="secondary">
              Rename
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            {user.role === 'owner' ? (
              <form
                action={async () => {
                  'use server';
                  await markTemplate(id, !deal.isTemplate);
                }}
              >
                <Button type="submit" variant="secondary" size="sm">
                  {deal.isTemplate ? 'Unmark template' : 'Mark as template'}
                </Button>
              </form>
            ) : null}
            <form
              action={async () => {
                'use server';
                await deleteDeal(id);
              }}
            >
              <Button type="submit" variant="danger" size="sm">
                Delete deal
              </Button>
            </form>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Revision {deal.rev} · created {new Date(deal.createdAt).toLocaleDateString('en-US')}
            {deal.clonedFrom ? ' · cloned' : ''}
          </p>
        </Card>
      </div>
    </div>
  );
}
