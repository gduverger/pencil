/**
 * The four features (10.1–10.4) as thin layers over engine data, with the post-check and the
 * regenerate-once rule of 10.5.
 */
import type { Budget, Provider, ProviderMessage, ProviderResponse } from './provider';
import { UNLIMITED_BUDGET } from './provider';
import { checkNumbers, type PostCheckResult } from './postcheck';
import {
  EXPLAIN_SYSTEM,
  FLAG_SYSTEM,
  INTAKE_SYSTEM,
  NARRATIVE_SYSTEM,
  explainUserPrompt,
  flagUserPrompt,
  intakeUserPrompt,
  narrativeUserPrompt,
} from './prompts';
import { setInputTool, validateSetInputCalls, type SetInputCall } from './tools';

export interface AssistantOptions {
  provider: Provider;
  budget?: Budget;
  orgId: string;
}

export interface CheckedText {
  text: string;
  /** True when the first response failed the post-check and the second was shown with a warning. */
  warning: string | null;
  attempts: number;
  check: PostCheckResult;
  usage: { inputTokens: number; outputTokens: number };
}

export class BudgetExceededError extends Error {
  readonly code = 'budget-exceeded';
  constructor() {
    super('The assistant budget for this organization is used up for the month.');
    this.name = 'BudgetExceededError';
  }
}

async function completeWithBudget(
  opts: AssistantOptions,
  request: Parameters<Provider['complete']>[0],
): Promise<ProviderResponse> {
  const budget = opts.budget ?? UNLIMITED_BUDGET;
  const estimate =
    Math.ceil(
      (request.system.length +
        request.messages.reduce(
          (s, m) =>
            s + m.content.reduce((t, c) => t + (c.type === 'text' ? c.text.length : 200), 0),
          0,
        )) /
        4,
    ) + (request.maxTokens ?? 600);
  if (!(await budget.allow(opts.orgId, estimate))) throw new BudgetExceededError();
  const response = await opts.provider.complete(request);
  await budget.record(opts.orgId, response.usage);
  return response;
}

/** Ask once; if any number is absent from the data, ask again once; then show with a warning (10.5). */
async function checkedCompletion(
  opts: AssistantOptions,
  system: string,
  user: string,
  data: unknown,
  maxTokens: number,
): Promise<CheckedText> {
  const messages: ProviderMessage[] = [{ role: 'user', content: [{ type: 'text', text: user }] }];
  let usage = { inputTokens: 0, outputTokens: 0 };
  const first = await completeWithBudget(opts, { system, messages, maxTokens, temperature: 0.2 });
  usage = {
    inputTokens: usage.inputTokens + first.usage.inputTokens,
    outputTokens: usage.outputTokens + first.usage.outputTokens,
  };
  const check1 = checkNumbers(first.text, data);
  if (check1.ok) return { text: first.text, warning: null, attempts: 1, check: check1, usage };
  const retry: ProviderMessage[] = [
    ...messages,
    { role: 'assistant', content: [{ type: 'text', text: first.text }] },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Your reply used numbers that are not in the data: ${check1.offending.map((t) => t.raw).join(', ')}. Rewrite it using only numbers from the data.`,
        },
      ],
    },
  ];
  const second = await completeWithBudget(opts, {
    system,
    messages: retry,
    maxTokens,
    temperature: 0,
  });
  usage = {
    inputTokens: usage.inputTokens + second.usage.inputTokens,
    outputTokens: usage.outputTokens + second.usage.outputTokens,
  };
  const check2 = checkNumbers(second.text, data);
  if (check2.ok) return { text: second.text, warning: null, attempts: 2, check: check2, usage };
  return {
    text: second.text,
    warning: `This text includes numbers that are not in the deal data (${check2.offending.map((t) => t.raw).join(', ')}). Check them before relying on it.`,
    attempts: 2,
    check: check2,
    usage,
  };
}

// ---------- 10.1 guided intake ----------

export interface IntakeInput {
  path: string;
  label: string;
  unit: string;
  value: unknown;
  source: string;
  benchmark?: { low: number; mid: number; high: number; asOf: string; source: string } | null;
}

export interface IntakeTurnArgs {
  /** The twelve inputs with their current values and benchmarks. */
  inputs: IntakeInput[];
  setup: {
    address: string;
    town: string | null;
    townCluster: string | null;
    constructionType: string;
  };
  transcript: Array<{ role: 'user' | 'assistant'; text: string }>;
  userText: string;
}

export interface IntakeTurnResult {
  text: string;
  proposals: SetInputCall[];
  rejected: Array<{ input: unknown; reason: string }>;
  warning: string | null;
  usage: { inputTokens: number; outputTokens: number };
}

export async function intakeTurn(
  opts: AssistantOptions,
  args: IntakeTurnArgs,
): Promise<IntakeTurnResult> {
  const data = { setup: args.setup, inputs: args.inputs };
  const messages: ProviderMessage[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: intakeUserPrompt(data, args.transcript, args.userText) }],
    },
  ];
  const response = await completeWithBudget(opts, {
    system: INTAKE_SYSTEM,
    messages,
    tools: [setInputTool()],
    maxTokens: 800,
    temperature: 0.2,
  });
  const { accepted, rejected } = validateSetInputCalls(response.toolCalls);
  // The user's own numbers are allowed in the reply, as are the deal data and the proposals.
  const check = checkNumbers(response.text, { data, user: args.userText, proposals: accepted });
  return {
    text: response.text,
    proposals: accepted,
    rejected,
    warning: check.ok
      ? null
      : `The reply mentions numbers that are not in the deal data or your message (${check.offending.map((t) => t.raw).join(', ')}).`,
    usage: response.usage,
  };
}

// ---------- 10.2 explain this number ----------

export interface ExplainArgs {
  trace: {
    cellRef: string;
    label: string;
    formula: string;
    operands: Array<{ name: string; value: number | string | null; unit?: string; ref?: string }>;
    value: number | string | null;
    unit: string;
    notes: string[];
  };
  inputs: Array<{
    path: string;
    label: string;
    value: unknown;
    source: string;
    note?: string;
    updatedAt?: string;
  }>;
}

export async function explainNumber(
  opts: AssistantOptions,
  args: ExplainArgs,
): Promise<CheckedText> {
  const data = { trace: args.trace, inputs: args.inputs };
  return checkedCompletion(opts, EXPLAIN_SYSTEM, explainUserPrompt(data), data, 400);
}

// ---------- 10.3 reviewer flags ----------

export interface FlagArgs {
  code: string;
  message: string;
  path?: string;
  label?: string;
  value?: number;
  unit?: string;
  benchmark?: { low: number; high: number; asOf: string; segment: string; source: string } | null;
}

/** A deterministic sentence that needs no model (used as the fallback and for engine flags). */
export function deterministicFlagSentence(flag: FlagArgs): string {
  if (flag.benchmark && typeof flag.value === 'number' && flag.label) {
    const fmt = (v: number) =>
      flag.unit === 'pct' || flag.unit === 'rate_pct'
        ? `${(v * 100).toFixed(2)}%`
        : flag.unit === 'usd_per_sf'
          ? `$${v.toFixed(2)}`
          : `$${Math.round(v).toLocaleString('en-US')}`;
    const side = flag.value < flag.benchmark.low ? 'below' : 'above';
    return `Your ${flag.label.toLowerCase()} of ${fmt(flag.value)} is ${side} the ${fmt(flag.benchmark.low)}–${fmt(flag.benchmark.high)} range for ${flag.benchmark.segment} as of ${flag.benchmark.asOf}.`;
  }
  return flag.message.endsWith('.') ? flag.message : `${flag.message}.`;
}

export async function flagSentence(opts: AssistantOptions, flag: FlagArgs): Promise<CheckedText> {
  return checkedCompletion(opts, FLAG_SYSTEM, flagUserPrompt(flag), flag, 120);
}

// ---------- 10.4 narrative draft ----------

export interface NarrativeArgs {
  dealName: string;
  site: { address?: string; town?: string };
  program: { totalUnits: number; gsfTotal: number; mix: string };
  register: Array<{ label: string; value: unknown; unit: string; source: string; note?: string }>;
  metrics: Record<'likely' | 'best' | 'worst', Record<string, number | null>>;
}

export async function draftNarrative(
  opts: AssistantOptions,
  args: NarrativeArgs,
): Promise<CheckedText> {
  return checkedCompletion(opts, NARRATIVE_SYSTEM, narrativeUserPrompt(args), args, 400);
}
