import { headers } from 'next/headers';

/** The public origin for links in exports, emails and checkout redirects. */
export async function baseUrl(): Promise<string> {
  if (process.env.PENCIL_BASE_URL) return process.env.PENCIL_BASE_URL;
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '127.0.0.1:3000';
  return `${proto}://${host}`;
}
