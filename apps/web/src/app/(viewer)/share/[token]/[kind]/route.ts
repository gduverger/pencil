import { NextResponse } from 'next/server';
import { resolveShare } from '@pencil/db';
import { getDb } from '@/lib/db';
import { CONTENT_TYPES, storage } from '@/lib/storage';
import { exportFile } from '@/server/package';

export const dynamic = 'force-dynamic';

/** Readers download both files from a share link; files are generated on first request (FR-7.2). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string; kind: string }> },
) {
  const { token, kind } = await params;
  if (kind !== 'pdf' && kind !== 'xlsx') return new NextResponse('Not found', { status: 404 });
  const db = await getDb();
  const resolved = await resolveShare(db, token);
  if (!resolved) return new NextResponse('Not found', { status: 404 });
  const url = new URL(req.url);
  const baseUrl = process.env.PENCIL_BASE_URL ?? `${url.protocol}//${url.host}`;
  const file = await exportFile(db, { versionId: resolved.version.id, kind, baseUrl });
  const files = await import('@pencil/db').then((m) => m.listFiles(db, resolved.version.id));
  const row = files.find((f) => f.id === file.fileId);
  const bytes = row ? await storage().get(row.storageKey) : null;
  if (!bytes) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'content-type': CONTENT_TYPES[kind],
      'content-disposition': `attachment; filename="${file.name}"`,
      'cache-control': 'private, no-store',
    },
  });
}
