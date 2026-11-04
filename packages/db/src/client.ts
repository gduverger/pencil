/**
 * Database client: PGlite (embedded Postgres) for local development and tests, postgres.js for a
 * real Postgres (Neon) in production. Both return the same Drizzle database type.
 */
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import { MIGRATIONS } from './migrations.generated';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  kind: 'pglite' | 'postgres';
  close(): Promise<void>;
}

export interface CreateDbOptions {
  /** `postgres://…` for a server; `pglite://<dir>` or `pglite://memory` for the embedded engine. */
  url?: string;
  /** Apply pending migrations on connect (default true). */
  migrate?: boolean;
}

/** Rows of a raw `db.execute`: PGlite returns `{ rows }`, postgres.js returns the array itself. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/** Apply embedded migrations that have not been applied yet, tracked in `pencil_migrations`. */
export async function migrate(db: Db): Promise<string[]> {
  await db.execute(
    sql`CREATE TABLE IF NOT EXISTS pencil_migrations (tag text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  const applied = new Set(
    rowsOf<{ tag: string }>(await db.execute(sql`SELECT tag FROM pencil_migrations`)).map(
      (r) => r.tag,
    ),
  );
  const done: string[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.tag)) continue;
    await db.transaction(async (tx) => {
      for (const statement of m.statements) await tx.execute(sql.raw(statement));
      await tx.execute(sql`INSERT INTO pencil_migrations (tag) VALUES (${m.tag})`);
    });
    done.push(m.tag);
  }
  return done;
}

export async function createDb(opts: CreateDbOptions = {}): Promise<DbHandle> {
  const url = opts.url ?? process.env.DATABASE_URL ?? 'pglite://memory';
  let handle: DbHandle;
  if (url.startsWith('pglite://')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const target = url.slice('pglite://'.length);
    if (target !== 'memory' && target !== '') {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(target, { recursive: true });
    }
    const client = target === 'memory' || target === '' ? new PGlite() : new PGlite(target);
    await client.waitReady;
    const db = drizzle(client, { schema }) as unknown as Db;
    handle = { db, kind: 'pglite', close: () => client.close() };
  } else {
    const { default: postgres } = await import('postgres');
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const client = postgres(url, { max: 5, prepare: false });
    const db = drizzle(client, { schema }) as unknown as Db;
    handle = { db, kind: 'postgres', close: () => client.end({ timeout: 5 }) };
  }
  if (opts.migrate !== false) await migrate(handle.db);
  return handle;
}
