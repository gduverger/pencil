import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/client';
import {
  buildContributions,
  countContributions,
  listContributedBenchmarks,
  recomputeContributedBenchmarks,
  recordContributions,
} from '../src/contributions';
import { listBenchmarks, resolveShare } from '../src/queries';
import { applyPatches } from '../src/state';
import { freshState, memoryDb, NOW, userAndOrg } from './helpers';

let handle: DbHandle;
beforeAll(async () => {
  handle = await memoryDb();
});
afterAll(async () => {
  await handle.close();
});

describe('9.6 contributions', () => {
  it('contains only metric, segment keys, value and export month — no address, name, note or free text', () => {
    const state = applyPatches(
      freshState(),
      [
        {
          scenario: 'likely',
          path: 'costs.hard.perGrossSF',
          value: 320,
          source: 'quote',
          note: 'GC budget — confidential',
        },
      ],
      'u',
      NOW,
    ).state;
    const rows = buildContributions(state, 'org-1', '2026-11');
    expect(rows.length).toBeGreaterThan(20);
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual([
        'exportedMonth',
        'metric',
        'orgId',
        'segment',
        'value',
      ]);
      expect(typeof r.value).toBe('number');
      expect(
        Object.keys(r.segment).every((k) =>
          ['townCluster', 'constructionType', 'unitType', 'projectSize'].includes(k),
        ),
      ).toBe(true);
    }
    const text = JSON.stringify(rows);
    expect(text).not.toContain('Highland');
    expect(text).not.toContain('Needham');
    expect(text).not.toContain('GC budget');
    expect(text).not.toContain('Test deal');
    const hard = rows.find((r) => r.metric === 'costs.hard.perGrossSF')!;
    expect(hard).toEqual({
      orgId: 'org-1',
      metric: 'costs.hard.perGrossSF',
      segment: {
        townCluster: 'inner-suburbs',
        constructionType: 'wood-frame',
        projectSize: '51-150',
      },
      value: 320,
      exportedMonth: '2026-11',
    });
    const rent = rows.find((r) => r.metric === 'program.unitTypes[2BR].rentPerMonth')!;
    expect(rent.segment.unitType).toBe('2BR');
    expect(rows.some((r) => r.metric === 'meta.name')).toBe(false);
  });

  it('the nightly recompute writes 25th/50th/75th percentiles only with ≥ 5 contributions from ≥ 3 organizations', async () => {
    const orgs = await Promise.all(
      ['a@x.com', 'b@x.com', 'c@x.com'].map((e) => userAndOrg(handle.db, e)),
    );
    const segment = {
      townCluster: 'inner-suburbs' as const,
      constructionType: 'wood-frame' as const,
      projectSize: '51-150' as const,
    };
    // Four contributions from two organizations: not enough.
    await recordContributions(handle.db, [
      {
        orgId: orgs[0]!.org.orgId,
        metric: 'costs.hard.perGrossSF',
        segment,
        value: 300,
        exportedMonth: '2026-10',
      },
      {
        orgId: orgs[0]!.org.orgId,
        metric: 'costs.hard.perGrossSF',
        segment,
        value: 310,
        exportedMonth: '2026-10',
      },
      {
        orgId: orgs[1]!.org.orgId,
        metric: 'costs.hard.perGrossSF',
        segment,
        value: 340,
        exportedMonth: '2026-11',
      },
      {
        orgId: orgs[1]!.org.orgId,
        metric: 'costs.hard.perGrossSF',
        segment,
        value: 350,
        exportedMonth: '2026-11',
      },
    ]);
    let r = await recomputeContributedBenchmarks(handle.db, '2026-11');
    expect(r.rangesWritten).toBe(0);
    expect(await listContributedBenchmarks(handle.db)).toHaveLength(0);
    // A fifth from a third organization unlocks the range: values 300, 310, 340, 350, 400.
    await recordContributions(handle.db, [
      {
        orgId: orgs[2]!.org.orgId,
        metric: 'costs.hard.perGrossSF',
        segment,
        value: 400,
        exportedMonth: '2026-11',
      },
    ]);
    r = await recomputeContributedBenchmarks(handle.db, '2026-11');
    expect(r.rangesWritten).toBe(1);
    // p25 = 310, p50 = 340, p75 = 350 (linear interpolation on 5 sorted values)
    expect(r.written[0]).toMatchObject({
      metric: 'costs.hard.perGrossSF',
      low: 310,
      mid: 340,
      high: 350,
      sampleSize: 5,
      organizations: 3,
    });
    const rows = await listContributedBenchmarks(handle.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toContain('5 deals from 3 organizations');
    expect(rows[0]!.contributorOrgId).toBeNull();
    expect(rows[0]!.unit).toBe('usd_per_sf');
    // Idempotent: rerunning updates in place.
    await recomputeContributedBenchmarks(handle.db, '2026-12');
    expect(
      (await listBenchmarks(handle.db)).filter((b) => b.id.startsWith('contrib:')),
    ).toHaveLength(1);
    expect(await countContributions(handle.db)).toBe(5);
    expect(await countContributions(handle.db, orgs[0]!.org.orgId)).toBe(2);
    void resolveShare;
  });
});
