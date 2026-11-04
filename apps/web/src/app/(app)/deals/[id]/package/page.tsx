import { getDeal, listEntitlements, listShares, listVersions } from '@pencil/db';
import { ENGINE_VERSION } from '@pencil/engine';
import { PackageScreen } from '@/components/package/package-screen';
import { getDb } from '@/lib/db';
import { hasEntitlement } from '@/lib/entitlements';
import { requireUser } from '@/lib/session';
import { buildPackageProps, loadBenchmarks } from '@/server/package-props';
import { headers } from 'next/headers';
import { assistantAvailable } from '@/server/assistant-actions';

export default async function PackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const db = await getDb();
  const { deal, state } = await getDeal(db, user.orgId, id);
  const [versions, shares, entitlements, benchmarks] = await Promise.all([listVersions(db, user.orgId, id), listShares(db, id), listEntitlements(db, user.orgId), loadBenchmarks(db)]);
  const h = await headers();
  const baseUrl = process.env.PENCIL_BASE_URL ?? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host') ?? '127.0.0.1:3000'}`;
  // Preview props without outputs: the client runs the engine on the live state.
  const previewProps = buildPackageProps({ state, outputs: {} as never, version: { dealName: deal.name, versionNumber: versions.length + 1, versionDate: new Date().toISOString().slice(0, 10), engineVersion: ENGINE_VERSION, ...(user.settings.letterheadName ? { preparedBy: user.settings.letterheadName } : {}) }, org: { name: user.orgName, settings: user.settings }, benchmarks });
  const { outputs: _omit, ...rest } = previewProps;
  void _omit;
  return (
    <PackageScreen
      dealId={deal.id}
      dealName={deal.name}
      rev={deal.rev}
      state={state}
      previewProps={rest}
      versions={versions}
      shares={shares.map((s) => ({ ...s, versionNumber: s.versionNumber }))}
      baseUrl={baseUrl}
      canExport={hasEntitlement(user.tier, entitlements, deal.id)}
      isReviewer={user.role === 'reviewer'}
      userId={user.id}
      assistantAvailable={await assistantAvailable()}
    />
  );
}
