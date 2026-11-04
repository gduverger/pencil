import { resolveDefaults } from '@pencil/benchmarks';
import { createDb, type DbHandle } from '../src/client';
import { newDealState, type DealSetup, type DealState } from '../src/state';
import { upsertUser, ensureOrganization } from '../src/queries';

export async function memoryDb(): Promise<DbHandle> {
  return createDb({ url: 'pglite://memory' });
}

export const NOW = '2026-11-04T10:00:00.000Z';

export function setup(): DealSetup {
  return { constructionType: 'wood-frame', townCluster: 'inner-suburbs', town: 'Needham', address: '120 Highland Avenue, Needham, MA', parcel: { lotSF: null, zoningDistrict: null, mbtaCommunitiesDistrict: null, assessedValue: null, annualTax: null, unitsByRight: null, lookupDate: NOW.slice(0, 10), notes: [] } };
}

/** A deal state from schema defaults (no benchmarks seeded), like a new deal in the app. */
export function freshState(actor = 'user-1'): DealState {
  const defaults = resolveDefaults([], { townCluster: 'inner-suburbs', constructionType: 'wood-frame', projectSize: '51-150' });
  return newDealState(defaults, setup(), actor, NOW, {
    'meta.name': { path: 'meta.name', value: 'Test deal', source: 'my-number', note: '', benchmarkId: null },
    'site.landCost': { path: 'site.landCost', value: 3_000_000, source: 'my-number', note: 'LOI', benchmarkId: null },
    'site.lotSF': { path: 'site.lotSF', value: 60000, source: 'my-number', note: '', benchmarkId: null },
  });
}

export async function userAndOrg(db: DbHandle['db'], email = 'alice@example.com') {
  const user = await upsertUser(db, { email, name: 'Alice' });
  const org = await ensureOrganization(db, user.id, 'Alice');
  return { user, org };
}
