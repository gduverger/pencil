import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveDefaults } from '@pencil/benchmarks';
import {
  createDb,
  createDeal,
  ensureOrganization,
  getOrganization,
  listEntitlements,
  newDealState,
  upsertUser,
  type DbHandle,
  type DealSetup,
} from '@pencil/db';
import { addMonths, applyBillingEvent } from '../src/lib/billing';
import { hasEntitlement } from '../src/lib/entitlements';

/** The webhook handler of FR-10.2 against an in-memory database, with Stripe payloads as JSON. */

let handle: DbHandle;
let orgId: string;
let dealA: string;
let dealB: string;
beforeAll(async () => {
  handle = await createDb({ url: 'pglite://memory' });
  const user = await upsertUser(handle.db, { email: 'owner@example.com', name: 'Owner' });
  orgId = (await ensureOrganization(handle.db, user.id, 'Owner')).orgId;
  const now = '2026-11-04T10:00:00.000Z';
  const setup: DealSetup = {
    constructionType: 'wood-frame',
    townCluster: 'inner-suburbs',
    town: 'Needham',
    address: '120 Highland Avenue, Needham, MA',
    parcel: {
      lotSF: null,
      zoningDistrict: null,
      mbtaCommunitiesDistrict: null,
      assessedValue: null,
      annualTax: null,
      unitsByRight: null,
      lookupDate: now.slice(0, 10),
      notes: [],
    },
  };
  const state = newDealState(
    resolveDefaults([], {
      townCluster: 'inner-suburbs',
      constructionType: 'wood-frame',
      projectSize: '51-150',
    }),
    setup,
    user.id,
    now,
    {},
  );
  dealA = (await createDeal(handle.db, { orgId, userId: user.id, name: 'A', state })).id;
  dealB = (await createDeal(handle.db, { orgId, userId: user.id, name: 'B', state })).id;
  process.env.PENCIL_DEFAULT_TIER = 'free';
});
const iso = (v: string | null | undefined) => (v ? new Date(v).toISOString() : v);
afterAll(async () => {
  await handle.close();
});

const NOW = new Date('2026-11-04T12:00:00.000Z');
const checkout = (id: string, extra: Record<string, unknown>) => ({
  id: `evt_${id}`,
  type: 'checkout.session.completed',
  data: {
    object: {
      id: `cs_${id}`,
      object: 'checkout.session',
      payment_status: 'paid',
      customer: 'cus_1',
      metadata: { orgId, kind: 'per-deal', dealId: dealA },
      ...extra,
    },
  },
});

describe('applyBillingEvent', () => {
  it('unlocks one deal for 12 months on a paid per-deal checkout, once per session and once per event', async () => {
    const r = await applyBillingEvent(handle.db, checkout('1', {}), { now: NOW });
    expect(r).toMatchObject({ applied: true, orgId, kind: 'per-deal' });
    const rows = await listEntitlements(handle.db, orgId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'per-deal', dealId: dealA, stripeRef: 'cs_1' });
    expect(rows[0]!.validUntil!.slice(0, 10)).toBe(addMonths(NOW, 12).toISOString().slice(0, 10));
    expect(hasEntitlement('free', rows, dealA, NOW)).toBe(true);
    expect(hasEntitlement('free', rows, dealB, NOW)).toBe(false);
    expect(hasEntitlement('free', rows, dealA, addMonths(NOW, 13))).toBe(false);
    // Redelivered event: acknowledged, not applied. Same session under a new event id: not applied either.
    expect(await applyBillingEvent(handle.db, checkout('1', {}), { now: NOW })).toMatchObject({
      applied: false,
      duplicate: true,
    });
    expect(
      await applyBillingEvent(handle.db, { ...checkout('1', {}), id: 'evt_1b' }, { now: NOW }),
    ).toMatchObject({ applied: false, duplicate: true });
    expect(await listEntitlements(handle.db, orgId)).toHaveLength(1);
    expect((await getOrganization(handle.db, orgId)).stripeCustomerId).toBe('cus_1');
  });

  it('ignores unpaid sessions and sessions without metadata', async () => {
    expect(
      await applyBillingEvent(handle.db, checkout('2', { payment_status: 'unpaid' }), { now: NOW }),
    ).toMatchObject({ applied: false });
    expect(
      await applyBillingEvent(handle.db, checkout('3', { metadata: {} }), { now: NOW }),
    ).toMatchObject({ applied: false, note: 'missing metadata' });
    expect(
      await applyBillingEvent(
        handle.db,
        checkout('4', { metadata: { orgId, kind: 'per-deal', dealId: '' } }),
        { now: NOW },
      ),
    ).toMatchObject({ applied: false });
    expect(await listEntitlements(handle.db, orgId)).toHaveLength(1);
  });

  it('Pro: sets the tier, uses the subscription period end, extends on renewal and stops at cancellation', async () => {
    const pro = checkout('5', {
      mode: 'subscription',
      subscription: 'sub_1',
      metadata: { orgId, kind: 'pro', dealId: '' },
    });
    const periodEnd = new Date('2027-11-04T12:00:00.000Z');
    expect(
      await applyBillingEvent(handle.db, pro, { now: NOW, periodEnd: async () => periodEnd }),
    ).toMatchObject({ applied: true, kind: 'pro' });
    let rows = await listEntitlements(handle.db, orgId);
    const sub = rows.find((r) => r.stripeRef === 'sub_1');
    expect(sub).toMatchObject({ kind: 'pro', dealId: null });
    expect(iso(sub?.validUntil)).toBe(periodEnd.toISOString());
    expect((await getOrganization(handle.db, orgId)).tier).toBe('pro');
    expect(hasEntitlement('pro', rows, dealB, NOW)).toBe(true);

    // A renewal invoice extends to the end of the paid period; a non-renewal invoice is ignored.
    const invoice = (id: string, reason: string, end: number) => ({
      id: `evt_${id}`,
      type: 'invoice.paid',
      data: {
        object: {
          id: `in_${id}`,
          object: 'invoice',
          customer: 'cus_1',
          billing_reason: reason,
          lines: { data: [{ period: { start: 0, end } }] },
        },
      },
    });
    expect(
      await applyBillingEvent(handle.db, invoice('6', 'subscription_create', 1), { now: NOW }),
    ).toMatchObject({ applied: false });
    const renewalEnd = Math.floor(new Date('2028-11-04T12:00:00.000Z').getTime() / 1000);
    expect(
      await applyBillingEvent(handle.db, invoice('7', 'subscription_cycle', renewalEnd), {
        now: NOW,
      }),
    ).toMatchObject({ applied: true, kind: 'pro' });
    rows = await listEntitlements(handle.db, orgId);
    expect(iso(rows.find((r) => r.stripeRef === 'in_7')?.validUntil)).toBe(
      new Date(renewalEnd * 1000).toISOString(),
    );
    // Unknown customers are ignored.
    expect(
      await applyBillingEvent(
        handle.db,
        {
          ...invoice('8', 'subscription_cycle', renewalEnd),
          data: {
            object: {
              ...invoice('8', 'subscription_cycle', renewalEnd).data.object,
              customer: 'cus_other',
            },
          },
        },
        { now: NOW },
      ),
    ).toMatchObject({ applied: false, note: 'unknown customer' });

    // Cancellation: tier back to free, access to the paid-through date.
    expect(
      await applyBillingEvent(
        handle.db,
        {
          id: 'evt_9',
          type: 'customer.subscription.deleted',
          data: { object: { id: 'sub_1', object: 'subscription', customer: 'cus_1' } },
        },
        { now: NOW },
      ),
    ).toMatchObject({ applied: true });
    expect((await getOrganization(handle.db, orgId)).tier).toBe('free');
    rows = await listEntitlements(handle.db, orgId);
    expect(hasEntitlement('free', rows, dealB, new Date('2028-10-01T00:00:00.000Z'))).toBe(true);
    expect(hasEntitlement('free', rows, dealB, new Date('2028-12-01T00:00:00.000Z'))).toBe(false);
  });

  it('acknowledges unrelated events without touching anything', async () => {
    const before = (await listEntitlements(handle.db, orgId)).length;
    expect(
      await applyBillingEvent(
        handle.db,
        { id: 'evt_10', type: 'payment_intent.created', data: { object: {} } },
        { now: NOW },
      ),
    ).toMatchObject({ applied: false, note: 'ignored payment_intent.created' });
    expect((await listEntitlements(handle.db, orgId)).length).toBe(before);
  });
});
