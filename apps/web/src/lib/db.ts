/**
 * One database handle per server process. DATABASE_URL selects Postgres (`postgres://…`) or the
 * embedded PGlite engine (`pglite://./.data/pencil`, the default for local development). Towns and
 * the benchmark seed are loaded on first connection.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, seedBenchmarks, seedTowns, type Db, type DbHandle } from '@pencil/db';
import { loadBenchmarksCsv } from '@pencil/benchmarks';
import { towns } from '@pencil/parcels';

declare global {
  var __pencilDb: Promise<DbHandle> | undefined;
}

async function seed(db: Db) {
  await seedTowns(
    db,
    towns().map((t) => ({ town: t.town, cluster: t.cluster, residentialTaxRate: t.residentialTaxRate, assessorUrl: t.assessorUrl, mbtaStatus: t.mbtaStatus })),
  );
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [process.env.PENCIL_BENCHMARK_SEED, join(process.cwd(), '..', '..', 'packages', 'benchmarks', 'seed', 'benchmarks.csv'), join(here, '..', '..', '..', '..', 'packages', 'benchmarks', 'seed', 'benchmarks.csv')].filter((p): p is string => Boolean(p));
    for (const path of candidates) {
      try {
        const rows = loadBenchmarksCsv(readFileSync(path, 'utf8'));
        await seedBenchmarks(db, rows.map((b) => ({ id: b.id, metric: b.metric, segment: b.segment, low: b.low, mid: b.mid, high: b.high, unit: b.unit, asOf: b.asOf, source: b.source, contributorOrgId: null, sampleSize: b.sampleSize })));
        break;
      } catch {
        /* try the next candidate */
      }
    }
  } catch {
    /* seed is optional */
  }
}

export function getDbHandle(): Promise<DbHandle> {
  if (!globalThis.__pencilDb) {
    const url = process.env.DATABASE_URL ?? 'pglite://./.data/pencil';
    globalThis.__pencilDb = createDb({ url }).then(async (handle) => {
      await seed(handle.db);
      return handle;
    });
  }
  return globalThis.__pencilDb;
}

export async function getDb(): Promise<Db> {
  return (await getDbHandle()).db;
}
