import { getDeal } from '@pencil/db';
import { ENGINE_VERSION } from '@pencil/engine';
import { ResultsScreen } from '@/components/results/results-screen';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/session';

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const db = await getDb();
  const { deal, state } = await getDeal(db, user.orgId, id);
  return <ResultsScreen dealId={deal.id} dealName={deal.name} rev={deal.rev} state={state} userId={user.id} versionDate={new Date().toISOString().slice(0, 10)} engineVersion={ENGINE_VERSION} />;
}
