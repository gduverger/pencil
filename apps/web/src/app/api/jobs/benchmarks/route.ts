import { NextResponse } from 'next/server';
import { recomputeContributedBenchmarks } from '@pencil/db';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The nightly benchmark job (spec 9.6), run by a scheduler (Vercel cron: `vercel.json`, which sends
 * CRON_SECRET as a bearer token) with the shared secret in the Authorization header or `?token=`. Locally: `pnpm --filter @pencil/web nightly`.
 */
export async function POST(req: Request) {
  const secret = process.env.JOBS_SECRET ?? process.env.CRON_SECRET ?? process.env.AUTH_SECRET;
  const url = new URL(req.url);
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('token');
  if (!secret || provided !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = await getDb();
  const result = await recomputeContributedBenchmarks(db, new Date().toISOString().slice(0, 7));
  console.log(JSON.stringify({ level: 'info', event: 'nightly-benchmarks', segmentsSeen: result.segmentsSeen, rangesWritten: result.rangesWritten }));
  return NextResponse.json({ ok: true, segmentsSeen: result.segmentsSeen, rangesWritten: result.rangesWritten, written: result.written });
}

export async function GET(req: Request) {
  return POST(req);
}
