import { getDeal, listBenchmarks, SWITCHES } from '@pencil/db';
import { inputCatalog } from '@pencil/engine';
import { projectSizeOf, resolveBenchmark, type Benchmark, type Segment } from '@pencil/benchmarks';
import { InputsScreen } from '@/components/inputs/inputs-screen';
import { AssistantPanel } from '@/components/assistant/assistant-panel';
import { assistantAvailable } from '@/server/assistant-actions';
import type { BenchmarkInfo } from '@/components/inputs/types';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/session';

export default async function InputsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const db = await getDb();
  const { deal, state } = await getDeal(db, user.orgId, id);
  const rows = await listBenchmarks(db);
  const benchmarks: Benchmark[] = rows.map((b) => ({
    id: b.id,
    metric: b.metric,
    segment: b.segment as Segment,
    low: b.low,
    mid: b.mid,
    high: b.high,
    unit: b.unit,
    asOf: b.asOf,
    source: b.source,
    contributorOrgId: b.contributorOrgId ?? null,
    sampleSize: b.sampleSize ?? null,
  }));
  const units = state.inputs['program.totalUnits']?.value;
  const segment: Segment = {
    constructionType: state.setup.constructionType,
    projectSize: projectSizeOf(typeof units === 'number' ? units : 60),
    ...(state.setup.townCluster ? { townCluster: state.setup.townCluster } : {}),
  };
  const byPath: Record<string, BenchmarkInfo> = {};
  for (const e of inputCatalog()) {
    const b = resolveBenchmark(benchmarks, e.path, segment);
    if (b)
      byPath[e.path] = {
        id: b.id,
        low: b.low,
        mid: b.mid,
        high: b.high,
        asOf: b.asOf,
        source: b.source,
        sampleSize: b.sampleSize,
      };
  }
  const available = await assistantAvailable();
  return (
    <div className="space-y-4">
      <AssistantPanel
        dealId={deal.id}
        rev={deal.rev}
        transcript={state.assistantTranscript}
        available={available}
      />
      <InputsScreen
        dealId={deal.id}
        dealName={deal.name}
        rev={deal.rev}
        state={state}
        catalog={inputCatalog()}
        benchmarks={byPath}
        switches={SWITCHES}
        userId={user.id}
      />
    </div>
  );
}
