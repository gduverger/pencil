import { notFound } from 'next/navigation';
import { PackageDocument } from '@pencil/package-pages';
import { getDb } from '@/lib/db';
import { verifyToken } from '@/lib/tokens';
import { versionPackageProps } from '@/server/package';

export const dynamic = 'force-dynamic';

/** The package route rendered to PDF (spec 8): token-protected, frozen to the Version. */
export default async function PackageRoute({ params, searchParams }: { params: Promise<{ versionId: string }>; searchParams: Promise<{ t?: string }> }) {
  const { versionId } = await params;
  const { t } = await searchParams;
  const payload = verifyToken<{ v: string; k: string }>(t);
  if (!payload || payload.k !== 'render' || payload.v !== versionId) notFound();
  const db = await getDb();
  const { props } = await versionPackageProps(db, versionId).catch(() => ({ props: null }));
  if (!props) notFound();
  return <PackageDocument props={props} />;
}
