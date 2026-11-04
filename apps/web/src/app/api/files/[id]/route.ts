import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { schema } from '@pencil/db';
import { getDb } from '@/lib/db';
import { CONTENT_TYPES, storage } from '@/lib/storage';
import { verifyToken } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

/** Signed, short-lived download of a Version file (spec 11.5). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const payload = verifyToken<{ f: string; k: string }>(url.searchParams.get('t'));
  if (!payload || payload.k !== 'file' || payload.f !== id)
    return new NextResponse('Forbidden', { status: 403 });
  const db = await getDb();
  const [row] = await db.select().from(schema.files).where(eq(schema.files.id, id));
  if (!row) return new NextResponse('Not found', { status: 404 });
  const bytes = await storage().get(row.storageKey);
  if (!bytes) return new NextResponse('Not found', { status: 404 });
  const name = url.searchParams.get('name') ?? `pencil.${row.kind}`;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'content-type': CONTENT_TYPES[row.kind as 'pdf' | 'xlsx'] ?? 'application/octet-stream',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'private, no-store',
    },
  });
}
