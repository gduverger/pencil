'use server';

/**
 * Assistant server actions (spec 10). Tool calls are the only way the assistant changes a deal,
 * and only after the user confirms each proposal; every response carries the engine's numbers as
 * data and passes the post-check; text is labeled as drafted by the assistant until edited.
 */
import { revalidatePath } from 'next/cache';
import {
  BudgetExceededError,
  deterministicFlagSentence,
  draftNarrative as draftNarrativeCore,
  explainNumber,
  flagSentence,
  intakeTurn,
  type SetInputCall,
} from '@pencil/assistant';
import {
  catalogEntry,
  explain,
  inputCatalog,
  runScenarios,
  type ScenarioKey,
} from '@pencil/engine';
import {
  applyPatches,
  scenarioOverrides,
  toDealInputs,
  tonightPaths,
  type InputPatch,
  type TranscriptMessage,
} from '@pencil/db/state';
import { getDeal, updateDealState, RevConflictError } from '@pencil/db';
import { resolveBenchmark } from '@pencil/benchmarks';
import { budget, getProvider } from '@/lib/assistant';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { buildRegister, loadBenchmarks, segmentOf } from './package-props';

export interface AssistantReply {
  ok: true;
  rev: number;
  message: TranscriptMessage;
  proposals: SetInputCall[];
  warning: string | null;
}
export type AssistantResult = AssistantReply | { ok: false; code: string; message: string };

function unavailable(): { ok: false; code: string; message: string } {
  return {
    ok: false,
    code: 'unavailable',
    message:
      'The assistant is not configured (set ANTHROPIC_API_KEY, or PENCIL_ASSISTANT_FAKE=1 for a scripted demo).',
  };
}

function errorResult(e: unknown): { ok: false; code: string; message: string } {
  if (e instanceof BudgetExceededError) return { ok: false, code: e.code, message: e.message };
  if (e instanceof RevConflictError) return { ok: false, code: 'rev-conflict', message: e.message };
  const err = e as { code?: string; message?: string };
  return {
    ok: false,
    code: err.code ?? 'error',
    message: err.message ?? 'The assistant request failed.',
  };
}

/** 10.1: one turn of the guided intake; proposals are returned for confirmation, the transcript is stored. */
export async function assistantMessage(
  dealId: string,
  rev: number,
  text: string,
): Promise<AssistantResult> {
  const provider = getProvider();
  if (!provider) return unavailable();
  const user = await requireUser();
  const db = await getDb();
  try {
    const { state } = await getDeal(db, user.orgId, dealId);
    const benchmarks = await loadBenchmarks(db);
    const segment = segmentOf(state);
    const inputs = tonightPaths().map((path) => {
      const entry = catalogEntry(path)!;
      const rec = state.inputs[path];
      const b = resolveBenchmark(benchmarks, path, segment);
      return {
        path,
        label: entry.label,
        unit: entry.unit,
        value: rec?.value,
        source: rec?.source ?? 'unknown',
        benchmark: b
          ? { low: b.low, mid: b.mid, high: b.high, asOf: b.asOf, source: b.source }
          : null,
      };
    });
    const transcript = state.assistantTranscript
      .filter((m) => m.role !== 'tool')
      .map((m) => ({ role: m.role as 'user' | 'assistant', text: m.text }));
    const turn = await intakeTurn(
      { provider, budget, orgId: user.orgId },
      {
        inputs,
        setup: {
          address: state.setup.address,
          town: state.setup.town,
          townCluster: state.setup.townCluster,
          constructionType: state.setup.constructionType,
        },
        transcript,
        userText: text,
      },
    );
    const now = new Date().toISOString();
    const userMsg: TranscriptMessage = {
      id: `m-${Date.now().toString(36)}-u`,
      role: 'user',
      text,
      at: now,
    };
    const assistantMsg: TranscriptMessage = {
      id: `m-${Date.now().toString(36)}-a`,
      role: 'assistant',
      text: turn.text,
      at: now,
      ...(turn.proposals.length ? { applied: [] } : {}),
    };
    const result = await updateDealState(db, {
      orgId: user.orgId,
      dealId,
      expectedRev: rev,
      mutate: (s) => ({
        state: { ...s, assistantTranscript: [...s.assistantTranscript, userMsg, assistantMsg] },
        history: [],
      }),
    });
    revalidatePath(`/deals/${dealId}/inputs`);
    return {
      ok: true,
      rev: result.deal.rev,
      message: assistantMsg,
      proposals: turn.proposals,
      warning: turn.warning,
    };
  } catch (e) {
    return errorResult(e);
  }
}

/** The user confirmed proposals: apply them as normal patches (source from the proposal, never calculated). */
export async function applyAssistantProposals(
  dealId: string,
  rev: number,
  messageId: string,
  proposals: SetInputCall[],
): Promise<{ ok: true; rev: number } | { ok: false; code: string; message: string }> {
  const user = await requireUser();
  const db = await getDb();
  try {
    const patches: InputPatch[] = proposals.map((p) => ({
      scenario: 'likely',
      path: p.path,
      value: p.value,
      source: p.source,
      note: p.note ? `${p.note} (confirmed from the assistant)` : 'Confirmed from the assistant',
    }));
    const result = await updateDealState(db, {
      orgId: user.orgId,
      dealId,
      expectedRev: rev,
      mutate: (s) => {
        const r = applyPatches(s, patches, user.id, new Date().toISOString());
        const transcript = r.state.assistantTranscript.map((m) =>
          m.id === messageId
            ? {
                ...m,
                applied: [
                  ...(m.applied ?? []),
                  ...proposals.map((p) => ({
                    path: p.path,
                    value: p.value,
                    source: p.source,
                    note: p.note,
                  })),
                ],
              }
            : m,
        );
        return { state: { ...r.state, assistantTranscript: transcript }, history: r.history };
      },
    });
    revalidatePath(`/deals/${dealId}/inputs`);
    return { ok: true, rev: result.deal.rev };
  } catch (e) {
    return errorResult(e);
  }
}

/** 10.2: two to four sentences for a cell, from the engine's trace. */
export async function explainCell(
  dealId: string,
  cellRef: string,
  scenario: ScenarioKey = 'likely',
): Promise<
  { ok: true; text: string; warning: string | null } | { ok: false; code: string; message: string }
> {
  const provider = getProvider();
  if (!provider) return unavailable();
  const user = await requireUser();
  const db = await getDb();
  try {
    const { state } = await getDeal(db, user.orgId, dealId);
    const outputs = runScenarios(toDealInputs(state, 'likely'), scenarioOverrides(state))[scenario];
    const trace = explain(outputs, cellRef);
    const inputs = inputCatalog()
      .filter((e) => e.star)
      .map((e) => ({
        path: e.path,
        label: e.label,
        value: state.inputs[e.path]?.value,
        source: state.inputs[e.path]?.source ?? 'unknown',
        ...(state.inputs[e.path]?.note ? { note: state.inputs[e.path]!.note } : {}),
        updatedAt: state.inputs[e.path]?.updatedAt,
      }));
    const r = await explainNumber({ provider, budget, orgId: user.orgId }, { trace, inputs });
    return { ok: true, text: r.text, warning: r.warning };
  } catch (e) {
    return errorResult(e);
  }
}

/** 10.3: one plain sentence per flag (engine flags and benchmark flags); deterministic when no provider. */
export async function flagSentences(
  dealId: string,
  scenario: ScenarioKey = 'likely',
): Promise<
  | { ok: true; sentences: Array<{ code: string; path?: string; text: string; drafted: boolean }> }
  | { ok: false; code: string; message: string }
> {
  const user = await requireUser();
  const db = await getDb();
  try {
    const { state } = await getDeal(db, user.orgId, dealId);
    const benchmarks = await loadBenchmarks(db);
    const outputs = runScenarios(toDealInputs(state, 'likely'), scenarioOverrides(state))[scenario];
    const register = buildRegister(state, benchmarks);
    const flags = [
      ...outputs.flags.map((f) => ({
        code: f.code,
        message: f.message,
        ...(f.path ? { path: f.path } : {}),
      })),
      ...register
        .filter((e) => e.flag && e.benchmark)
        .map((e) => ({
          code: 'outside-benchmark',
          message: e.flag!,
          path: e.path,
          label: e.label,
          value: typeof e.value === 'number' ? e.value : undefined,
          unit: e.unit,
          benchmark: {
            low: e.benchmark!.low,
            high: e.benchmark!.high,
            asOf: e.benchmark!.asOf,
            segment: e.benchmark!.source,
            source: e.benchmark!.source,
          },
        })),
    ];
    const provider = getProvider();
    const sentences = [] as Array<{ code: string; path?: string; text: string; drafted: boolean }>;
    for (const f of flags) {
      if (!provider) {
        sentences.push({
          code: f.code,
          ...(f.path ? { path: f.path } : {}),
          text: deterministicFlagSentence(f),
          drafted: false,
        });
        continue;
      }
      try {
        const r = await flagSentence({ provider, budget, orgId: user.orgId }, f);
        sentences.push({
          code: f.code,
          ...(f.path ? { path: f.path } : {}),
          text: r.warning ? deterministicFlagSentence(f) : r.text,
          drafted: !r.warning,
        });
      } catch {
        sentences.push({
          code: f.code,
          ...(f.path ? { path: f.path } : {}),
          text: deterministicFlagSentence(f),
          drafted: false,
        });
      }
    }
    return { ok: true, sentences };
  } catch (e) {
    return errorResult(e);
  }
}

/** 10.4: a ~120-word narrative draft, stored as the package narrative labeled "drafted by the assistant" until edited. */
export async function draftNarrative(
  dealId: string,
  rev: number,
): Promise<
  | { ok: true; rev: number; text: string; warning: string | null }
  | { ok: false; code: string; message: string }
> {
  const provider = getProvider();
  if (!provider) return unavailable();
  const user = await requireUser();
  const db = await getDb();
  try {
    const { deal, state } = await getDeal(db, user.orgId, dealId);
    const benchmarks = await loadBenchmarks(db);
    const outputs = runScenarios(toDealInputs(state, 'likely'), scenarioOverrides(state));
    const register = buildRegister(state, benchmarks).map((e) => ({
      label: e.label,
      value: e.value,
      unit: e.unit,
      source: e.source,
      ...(e.note ? { note: e.note } : {}),
    }));
    const metrics = (k: ScenarioKey) => ({
      projectIrr: outputs[k].metrics.projectIrr,
      lpIrr: outputs[k].metrics.lpIrr,
      equityMultiple: outputs[k].metrics.equityMultiple,
      yieldOnCost: outputs[k].metrics.yieldOnCost,
      totalProjectCost: outputs[k].totals.tpc,
      costPerUnit: outputs[k].metrics.costPerUnit,
    });
    const program = outputs.likely.program;
    const r = await draftNarrativeCore(
      { provider, budget, orgId: user.orgId },
      {
        dealName: deal.name,
        site: {
          address: state.setup.address,
          ...(state.setup.town ? { town: state.setup.town } : {}),
        },
        program: {
          totalUnits: program.totalUnits,
          gsfTotal: program.gsfTotal,
          mix: program.unitTypes.map((u) => `${u.units} ${u.key}`).join(', '),
        },
        register,
        metrics: { likely: metrics('likely'), best: metrics('best'), worst: metrics('worst') },
      },
    );
    const result = await updateDealState(db, {
      orgId: user.orgId,
      dealId,
      expectedRev: rev,
      mutate: (s) => ({
        state: {
          ...s,
          packageSettings: { ...s.packageSettings, narrative: r.text, narrativeDrafted: true },
        },
        history: [],
      }),
    });
    revalidatePath(`/deals/${dealId}/package`);
    return { ok: true, rev: result.deal.rev, text: r.text, warning: r.warning };
  } catch (e) {
    return errorResult(e);
  }
}

export async function assistantAvailable(): Promise<boolean> {
  return getProvider() !== null;
}
