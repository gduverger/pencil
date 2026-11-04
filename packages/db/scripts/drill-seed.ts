/**
 * Restore-drill seed: runs the migrations into DATABASE_URL, writes one user, organization and deal
 * and prints the deal id. Used by scripts/restore-drill.sh.
 */
import { resolveDefaults } from '@pencil/benchmarks';
import { createDb } from '../src/client';
import { createDeal, ensureOrganization, upsertUser } from '../src/queries';
import { newDealState, type DealSetup } from '../src/state';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const handle = await createDb({ url });
  const now = new Date().toISOString();
  const user = await upsertUser(handle.db, { email: 'drill@example.com', name: 'Drill' });
  const org = await ensureOrganization(handle.db, user.id, 'Drill');
  const setup: DealSetup = {
    constructionType: 'wood-frame',
    townCluster: 'inner-suburbs',
    town: 'Needham',
    address: '120 Highland Avenue, Needham, MA',
    parcel: { lotSF: null, zoningDistrict: null, mbtaCommunitiesDistrict: null, assessedValue: null, annualTax: null, unitsByRight: null, lookupDate: now.slice(0, 10), notes: [] },
  };
  const defaults = resolveDefaults([], { townCluster: 'inner-suburbs', constructionType: 'wood-frame', projectSize: '51-150' });
  const state = newDealState(defaults, setup, user.id, now, { 'meta.name': { path: 'meta.name', value: 'Restore drill', source: 'my-number', note: '', benchmarkId: null } });
  const deal = await createDeal(handle.db, { orgId: org.orgId, userId: user.id, name: 'Restore drill', town: 'Needham', state });
  await handle.close();
  process.stdout.write(`${deal.id}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
