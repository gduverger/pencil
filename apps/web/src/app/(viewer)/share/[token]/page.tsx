import { notFound } from 'next/navigation';
import { resolveShare } from '@pencil/db';
import { PackageDocument } from '@pencil/package-pages';
import { getDb } from '@/lib/db';
import { versionPackageProps } from '@/server/package';

export const dynamic = 'force-dynamic';

/** Read-only share viewer (FR-7.2): resolves the token to its Version; expired or revoked → 404. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const resolved = await resolveShare(db, token);
  if (!resolved) notFound();
  const { props } = await versionPackageProps(db, resolved.version.id);
  return (
    <div>
      <header style={{ background: '#fff', borderBottom: '1px solid #d9d7d2', padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', fontFamily: 'Inter, sans-serif' }} data-testid="share-header">
        <div>
          <div style={{ fontWeight: 600 }}>{resolved.deal.name}</div>
          <div style={{ fontSize: 12, color: '#52514e' }}>
            Feasibility package · Version {resolved.version.number} · {resolved.version.createdAt.slice(0, 10)} · shared read-only by {resolved.org.name}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={`/share/${token}/pdf`} style={linkStyle} data-testid="share-download-pdf">
            Download PDF
          </a>
          <a href={`/share/${token}/xlsx`} style={linkStyle} data-testid="share-download-xlsx">
            Download Excel
          </a>
        </div>
      </header>
      <PackageDocument props={props} />
    </div>
  );
}

const linkStyle = { fontSize: 13, padding: '6px 10px', border: '1px solid #d9d7d2', borderRadius: 6, color: '#111', textDecoration: 'none', background: '#fff' } as const;
