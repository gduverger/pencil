import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/client';
import { applyPatches, upsertEvent } from '../src/state';
import { cloneDeal, createDeal, createShare, createVersion, deleteDeal, getDeal, listDeals, listHistory, listMemberships, listShares, listVersions, markTemplate, requireMembership, resolveShare, revokeShare, RevConflictError, updateDealState, NotFoundError, ForbiddenError, seedTowns, listTowns, seedBenchmarks, listBenchmarks } from '../src/queries';
import { freshState, memoryDb, NOW, userAndOrg } from './helpers';
import { schema } from '../src/index';
import { count, eq } from 'drizzle-orm';

let handle: DbHandle;
beforeAll(async () => {
  handle = await memoryDb();
});
afterAll(async () => {
  await handle.close();
});

describe('organizations and membership', () => {
  it('creates a personal organization on first use and scopes access by membership', async () => {
    const { user, org } = await userAndOrg(handle.db);
    expect(org.role).toBe('owner');
    expect((await listMemberships(handle.db, user.id))).toHaveLength(1);
    await expect(requireMembership(handle.db, user.id, org.orgId)).resolves.toBeTruthy();
    await expect(requireMembership(handle.db, user.id, org.orgId, ['reviewer'])).rejects.toThrow(ForbiddenError);
    const { user: other } = await userAndOrg(handle.db, 'bob@example.com');
    await expect(requireMembership(handle.db, other.id, org.orgId)).rejects.toThrow(ForbiddenError);
  });
});

describe('deals, state, history and concurrency', () => {
  it('creates a deal with its state and one history row per input', async () => {
    const { user, org } = await userAndOrg(handle.db);
    const state = freshState(user.id);
    const deal = await createDeal(handle.db, { orgId: org.orgId, userId: user.id, name: 'Needham 60', state, town: 'Needham' });
    expect(deal.rev).toBe(1);
    const loaded = await getDeal(handle.db, org.orgId, deal.id);
    expect(loaded.state.inputs['site.landCost']!.value).toBe(3_000_000);
    const history = await listHistory(handle.db, org.orgId, deal.id);
    expect(history.length).toBe(Object.keys(state.inputs).length);
    expect((await listDeals(handle.db, org.orgId)).some((d) => d.id === deal.id)).toBe(true);
    // another organization cannot see it
    const { org: otherOrg } = await userAndOrg(handle.db, 'carol@example.com');
    await expect(getDeal(handle.db, otherOrg.orgId, deal.id)).rejects.toThrow(NotFoundError);
  });

  it('writes history rows in the same transaction as the state change and bumps rev', async () => {
    const { user, org } = await userAndOrg(handle.db);
    const deal = await createDeal(handle.db, { orgId: org.orgId, userId: user.id, name: 'History', state: freshState(user.id) });
    const before = (await listHistory(handle.db, org.orgId, deal.id, 'costs.hard.perGrossSF')).length;
    const r = await updateDealState(handle.db, { orgId: org.orgId, dealId: deal.id, expectedRev: 1, mutate: (s) => applyPatches(s, [{ scenario: 'likely', path: 'costs.hard.perGrossSF', value: 320, source: 'quote', note: 'GC' }], user.id, NOW) });
    expect(r.deal.rev).toBe(2);
    expect(r.state.inputs['costs.hard.perGrossSF']!.value).toBe(320);
    const after = await listHistory(handle.db, org.orgId, deal.id, 'costs.hard.perGrossSF');
    expect(after.length).toBe(before + 1);
    expect(after[0]).toMatchObject({ priorValue: 350, priorSource: 'unknown', changedBy: user.id });
    // a mutation that throws rolls back the rev bump
    await expect(updateDealState(handle.db, { orgId: org.orgId, dealId: deal.id, expectedRev: 2, mutate: () => { throw new Error('boom'); } })).rejects.toThrow('boom');
    expect((await getDeal(handle.db, org.orgId, deal.id)).deal.rev).toBe(2);
  });

  it('a concurrent edit with a stale rev is rejected, never silently overwritten', async () => {
    const { user, org } = await userAndOrg(handle.db);
    const deal = await createDeal(handle.db, { orgId: org.orgId, userId: user.id, name: 'Concurrent', state: freshState(user.id) });
    await updateDealState(handle.db, { orgId: org.orgId, dealId: deal.id, expectedRev: 1, mutate: (s) => applyPatches(s, [{ scenario: 'likely', path: 'site.landCost', value: 3_100_000 }], 'a', NOW) });
    let err: unknown;
    try {
      await updateDealState(handle.db, { orgId: org.orgId, dealId: deal.id, expectedRev: 1, mutate: (s) => applyPatches(s, [{ scenario: 'likely', path: 'site.landCost', value: 9 }], 'b', NOW) });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(RevConflictError);
    expect((err as RevConflictError).actual).toBe(2);
    expect((await getDeal(handle.db, org.orgId, deal.id)).state.inputs['site.landCost']!.value).toBe(3_100_000);
  });

  it('clones with history reset and marks templates', async () => {
    const { user, org } = await userAndOrg(handle.db);
    const src = await createDeal(handle.db, { orgId: org.orgId, userId: user.id, name: 'Source', state: upsertEvent(freshState(user.id), { label: 'Grant', month: 1, amount: 1000, kind: 'inflow', category: 'inflow' }, user.id, NOW).state });
    const copy = await cloneDeal(handle.db, { orgId: org.orgId, userId: user.id, sourceDealId: src.id, now: NOW });
    expect(copy.name).toBe('Source (copy)');
    expect(copy.clonedFrom).toBe(src.id);
    const loaded = await getDeal(handle.db, org.orgId, copy.id);
    expect(loaded.state.events).toHaveLength(1);
    const history = await listHistory(handle.db, org.orgId, copy.id);
    expect(history.every((h) => h.priorNote === 'cloned from Source')).toBe(true);
    expect((await markTemplate(handle.db, org.orgId, src.id, true)).isTemplate).toBe(true);
  });

  it('versions and shares: immutable snapshots, token resolution, expiry and revocation; deletion cascades', async () => {
    const { user, org } = await userAndOrg(handle.db);
    const deal = await createDeal(handle.db, { orgId: org.orgId, userId: user.id, name: 'Versioned', state: freshState(user.id) });
    const { state } = await getDeal(handle.db, org.orgId, deal.id);
    const v1 = await createVersion(handle.db, { orgId: org.orgId, dealId: deal.id, userId: user.id, snapshot: state, outputs: { ok: true }, engineVersion: '0.1.0' });
    const v2 = await createVersion(handle.db, { orgId: org.orgId, dealId: deal.id, userId: user.id, snapshot: state, outputs: { ok: true }, engineVersion: '0.1.0' });
    expect([v1.number, v2.number]).toEqual([1, 2]);
    expect((await listVersions(handle.db, org.orgId, deal.id)).map((v) => v.number)).toEqual([2, 1]);
    const share = await createShare(handle.db, { versionId: v1.id, userId: user.id, token: 'tok-1' });
    const resolved = await resolveShare(handle.db, 'tok-1');
    expect(resolved?.version.number).toBe(1);
    expect(resolved?.deal.name).toBe('Versioned');
    const expired = await createShare(handle.db, { versionId: v1.id, userId: user.id, token: 'tok-2', expiresAt: '2020-01-01T00:00:00.000Z' });
    expect(await resolveShare(handle.db, expired.token)).toBeNull();
    await revokeShare(handle.db, share.id);
    expect(await resolveShare(handle.db, 'tok-1')).toBeNull();
    expect(await resolveShare(handle.db, 'nope')).toBeNull();
    expect((await listShares(handle.db, deal.id))).toHaveLength(2);
    await deleteDeal(handle.db, org.orgId, deal.id);
    const [h] = await handle.db.select({ n: count() }).from(schema.inputHistory).where(eq(schema.inputHistory.dealId, deal.id));
    const [v] = await handle.db.select({ n: count() }).from(schema.versions).where(eq(schema.versions.dealId, deal.id));
    const [s] = await handle.db.select({ n: count() }).from(schema.shares);
    expect(Number(h!.n)).toBe(0);
    expect(Number(v!.n)).toBe(0);
    expect(Number(s!.n)).toBe(0);
    await expect(deleteDeal(handle.db, org.orgId, deal.id)).rejects.toThrow(NotFoundError);
  });

  it('seeds towns and benchmarks idempotently', async () => {
    await seedTowns(handle.db, [{ town: 'Needham', cluster: 'inner-suburbs', residentialTaxRate: 11.9, assessorUrl: '', mbtaStatus: 'commuter rail community' }]);
    await seedTowns(handle.db, [{ town: 'Needham', cluster: 'inner-suburbs', residentialTaxRate: 12.0, assessorUrl: '', mbtaStatus: 'commuter rail community' }]);
    const towns = await listTowns(handle.db);
    expect(towns.filter((t) => t.town === 'Needham')).toHaveLength(1);
    expect(towns.find((t) => t.town === 'Needham')!.residentialTaxRate).toBe(12);
    await seedBenchmarks(handle.db, [{ id: 'seed-1', metric: 'costs.hard.perGrossSF', segment: { townCluster: 'inner-suburbs' }, low: 280, mid: 320, high: 360, unit: 'usd_per_sf', asOf: '2026-09', source: 'Mark' }]);
    await seedBenchmarks(handle.db, [{ id: 'seed-1', metric: 'costs.hard.perGrossSF', segment: { townCluster: 'inner-suburbs' }, low: 290, mid: 320, high: 360, unit: 'usd_per_sf', asOf: '2026-09', source: 'Mark' }]);
    const rows = await listBenchmarks(handle.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.low).toBe(290);
  });
});

describe('assistant usage budget rows', () => {
  it('accumulates requests and tokens per organization and month', async () => {
    const { org } = await userAndOrg(handle.db, 'usage@example.com');
    const { assistantUsage, recordAssistantUsage } = await import('../src/queries');
    expect(await assistantUsage(handle.db, org.orgId, '2026-11')).toEqual({ requests: 0, tokens: 0 });
    await recordAssistantUsage(handle.db, org.orgId, '2026-11', 1200);
    await recordAssistantUsage(handle.db, org.orgId, '2026-11', 800);
    expect(await assistantUsage(handle.db, org.orgId, '2026-11')).toEqual({ requests: 2, tokens: 2000 });
    expect(await assistantUsage(handle.db, org.orgId, '2026-12')).toEqual({ requests: 0, tokens: 0 });
  });
});
