import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  benchmarksFromSeed,
  checkAgainstBenchmark,
  contributionMetrics,
  flagsForValues,
  loadBenchmarksCsv,
  parseSeedCsv,
  percentiles,
  projectSizeOf,
  resolveBenchmark,
  resolveDefaults,
  type Benchmark,
} from '../src/index';

const seedPath = join(__dirname, '..', 'seed', 'benchmarks.csv');

const sample: Benchmark[] = [
  {
    id: 'b1',
    metric: 'costs.hard.perGrossSF',
    segment: {},
    low: 250,
    mid: 300,
    high: 380,
    unit: 'usd_per_sf',
    asOf: '2026-06',
    source: 'statewide',
    contributorOrgId: null,
    sampleSize: 12,
  },
  {
    id: 'b2',
    metric: 'costs.hard.perGrossSF',
    segment: { townCluster: 'inner-suburbs' },
    low: 280,
    mid: 320,
    high: 360,
    unit: 'usd_per_sf',
    asOf: '2026-09',
    source: 'Mark — 2025 bids, 4 projects',
    contributorOrgId: null,
    sampleSize: 4,
  },
  {
    id: 'b3',
    metric: 'costs.hard.perGrossSF',
    segment: { townCluster: 'inner-suburbs', constructionType: 'podium' },
    low: 330,
    mid: 360,
    high: 400,
    unit: 'usd_per_sf',
    asOf: '2026-09',
    source: 'Mark',
    contributorOrgId: null,
    sampleSize: 2,
  },
  {
    id: 'b4',
    metric: 'program.unitTypes[2BR].rentPerMonth',
    segment: { townCluster: 'inner-suburbs', unitType: '2BR' },
    low: 2700,
    mid: 3000,
    high: 3200,
    unit: 'usd_per_unit_month',
    asOf: '2026-09',
    source: 'Mark',
    contributorOrgId: null,
    sampleSize: null,
  },
];

describe('9.1–9.3 schema, loader and resolution', () => {
  it('the seed template has every row of 9.2 with blank ranges, so it yields no benchmarks yet', () => {
    const text = readFileSync(seedPath, 'utf8');
    const rows = parseSeedCsv(text);
    expect(rows.length).toBeGreaterThan(80);
    expect(
      rows.some(
        (r) =>
          r.metric === 'costs.hard.perGrossSF' &&
          r.segment.townCluster === 'inner-suburbs' &&
          r.segment.constructionType === 'podium',
      ),
    ).toBe(true);
    expect(
      rows.some(
        (r) => r.metric === 'timeline.constructionMonths' && r.segment.projectSize === '51-150',
      ),
    ).toBe(true);
    expect(rows.every((r) => r.low === null)).toBe(true);
    expect(loadBenchmarksCsv(text)).toEqual([]);
  });

  it('filled rows become benchmarks with ids and parsed segments', () => {
    const text =
      'metric,town_cluster,construction_type,unit_type,project_size,low,mid,high,unit,as_of,source,sample_size\ncosts.hard.perGrossSF,inner-suburbs,podium,,,330,360,400,usd_per_sf,2026-09,"Mark, 2 bids",2\n';
    const [b] = loadBenchmarksCsv(text);
    expect(b).toMatchObject({
      id: 'seed-1',
      metric: 'costs.hard.perGrossSF',
      segment: { townCluster: 'inner-suburbs', constructionType: 'podium' },
      low: 330,
      mid: 360,
      high: 400,
      source: 'Mark, 2 bids',
      sampleSize: 2,
    });
    expect(benchmarksFromSeed(parseSeedCsv(text), 'x')[0]!.id).toBe('x-1');
  });

  it('resolves the most specific matching segment, then falls back', () => {
    expect(
      resolveBenchmark(sample, 'costs.hard.perGrossSF', {
        townCluster: 'inner-suburbs',
        constructionType: 'podium',
        projectSize: '51-150',
      })?.id,
    ).toBe('b3');
    expect(
      resolveBenchmark(sample, 'costs.hard.perGrossSF', {
        townCluster: 'inner-suburbs',
        constructionType: 'wood-frame',
      })?.id,
    ).toBe('b2');
    expect(
      resolveBenchmark(sample, 'costs.hard.perGrossSF', { townCluster: 'gateway-cities' })?.id,
    ).toBe('b1');
    expect(
      resolveBenchmark(sample, 'program.unitTypes[2BR].rentPerMonth', {
        townCluster: 'boston-core',
      }),
    ).toBeUndefined();
    expect(resolveBenchmark(sample, 'nope', {})).toBeUndefined();
  });

  it('ties go to the more recent as-of, then larger samples', () => {
    const tied: Benchmark[] = [
      { ...sample[0]!, id: 'old', asOf: '2025-01', sampleSize: 50 },
      { ...sample[0]!, id: 'new', asOf: '2026-01', sampleSize: 3 },
      { ...sample[0]!, id: 'new-big', asOf: '2026-01', sampleSize: 9 },
    ];
    expect(resolveBenchmark(tied, 'costs.hard.perGrossSF', {})?.id).toBe('new-big');
  });

  it('defaults every catalogued input: benchmark mid with source benchmark, else schema default with source unknown', () => {
    const defaults = resolveDefaults(sample, {
      townCluster: 'inner-suburbs',
      constructionType: 'podium',
    });
    const hard = defaults.find((d) => d.path === 'costs.hard.perGrossSF')!;
    expect(hard).toMatchObject({ value: 360, source: 'benchmark', benchmarkId: 'b3' });
    const rent = defaults.find((d) => d.path === 'program.unitTypes[2BR].rentPerMonth')!;
    expect(rent).toMatchObject({ value: 3000, source: 'benchmark', benchmarkId: 'b4' });
    const vacancy = defaults.find((d) => d.path === 'operations.stabilizedVacancyPct')!;
    expect(vacancy).toMatchObject({ value: 0.05, source: 'unknown', benchmarkId: null });
    expect(defaults.length).toBeGreaterThan(60);
  });

  it('buckets project size', () => {
    expect(projectSizeOf(20)).toBe('20-50');
    expect(projectSizeOf(50)).toBe('20-50');
    expect(projectSizeOf(51)).toBe('51-150');
    expect(projectSizeOf(300)).toBe('151-300');
  });
});

describe('9.4 flags', () => {
  it('flags a value outside [low, high] with the range in the message and never blocks', () => {
    const b = sample[3]!;
    const above = checkAgainstBenchmark('program.unitTypes[2BR].rentPerMonth', 3400, b)!;
    expect(above.inRange).toBe(false);
    expect(above.flag).toMatchObject({
      path: 'program.unitTypes[2BR].rentPerMonth',
      code: 'outside-benchmark',
    });
    expect(above.flag!.message).toBe(
      'Market rent per month of $3,400 is above the $2,700–$3,200 range for inner-suburbs, 2BR as of 2026-09',
    );
    expect(checkAgainstBenchmark('program.unitTypes[2BR].rentPerMonth', 3000, b)!.flag).toBeNull();
    expect(checkAgainstBenchmark('x', 1, undefined)).toBeNull();
    expect(checkAgainstBenchmark('x', 'text', b)).toBeNull();
    const flags = flagsForValues(
      sample,
      { townCluster: 'inner-suburbs', constructionType: 'podium' },
      {
        'costs.hard.perGrossSF': 250,
        'program.unitTypes[2BR].rentPerMonth': 3000,
        'meta.name': 'x',
      },
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]!.message).toContain('below the $330.00–$400.00 range');
  });
});

describe('9.6 percentiles and contribution metrics', () => {
  it('computes 25th/50th/75th percentiles with interpolation', () => {
    expect(percentiles([1, 2, 3, 4, 5])).toEqual({ p25: 2, p50: 3, p75: 4 });
    expect(percentiles([10])).toEqual({ p25: 10, p50: 10, p75: 10 });
    expect(percentiles([])).toBeNull();
  });
  it('lists the seed-list metrics as catalogued numeric paths', () => {
    const m = contributionMetrics();
    expect(m).toContain('costs.hard.perGrossSF');
    expect(m).toContain('program.unitTypes[1BR].rentPerMonth');
    expect(m).toContain('exit.exitCapRatePct');
    expect(m).not.toContain('meta.name');
    expect(m).not.toContain('financing.permanent.enabled');
  });
});
