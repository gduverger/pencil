/**
 * Assistant provider and budget for the web app (spec 10). The real provider is Claude through
 * the Anthropic SDK; with PENCIL_ASSISTANT_FAKE=1 (demos, end-to-end tests) a scripted provider
 * replays recorded responses so the panels work without a key.
 */
import {
  anthropicProviderFromEnv,
  FakeProvider,
  type Budget,
  type Provider,
  type ProviderRequest,
  type ProviderResponse,
} from '@pencil/assistant';
import { assistantUsage, recordAssistantUsage } from '@pencil/db';
import { getDb } from './db';

const MONTHLY_TOKENS = Number(process.env.PENCIL_ASSISTANT_MONTHLY_TOKENS ?? 2_000_000);
const MONTHLY_REQUESTS = Number(process.env.PENCIL_ASSISTANT_MONTHLY_REQUESTS ?? 2_000);

export const budget: Budget = {
  async allow(orgId, estimatedTokens) {
    const db = await getDb();
    const month = new Date().toISOString().slice(0, 7);
    const used = await assistantUsage(db, orgId, month);
    return used.requests < MONTHLY_REQUESTS && used.tokens + estimatedTokens <= MONTHLY_TOKENS;
  },
  async record(orgId, usage) {
    const db = await getDb();
    await recordAssistantUsage(
      db,
      orgId,
      new Date().toISOString().slice(0, 7),
      usage.inputTokens + usage.outputTokens,
    );
  },
};

/**
 * A scripted provider for demos and tests: it reads the user's message and the data it is given
 * and answers like a recorded transcript. Numbers come only from the data or the user's words.
 */
class ScriptedProvider implements Provider {
  readonly name = 'scripted';
  private readonly fake = new FakeProvider();
  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const text = request.messages
      .map((m) => m.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n'))
      .join('\n');
    const usage = { inputTokens: Math.ceil(text.length / 4), outputTokens: 80 };
    if (request.system.includes('intake assistant')) {
      const user = text.split('\nUser: ').pop() ?? '';
      const toolCalls: ProviderResponse['toolCalls'] = [];
      const units = user.match(/(\d{2,3})\s*units/i);
      if (units)
        toolCalls.push({
          id: 'u',
          name: 'setInput',
          input: {
            path: 'program.totalUnits',
            value: Number(units[1]),
            source: 'my-number',
            note: 'Stated by the user in the intake conversation',
          },
        });
      const land =
        user.match(/\$\s?([\d,.]+)\s*(m|million)?\s*(?:for|of)?\s*(?:the\s*)?land/i) ??
        user.match(/land[^$]*\$\s?([\d,.]+)\s*(m|million)?/i);
      if (land) {
        const n = Number(land[1]!.replace(/,/g, '')) * (land[2] ? 1_000_000 : 1);
        toolCalls.push({
          id: 'l',
          name: 'setInput',
          input: {
            path: 'site.landCost',
            value: n,
            source: 'my-number',
            note: 'Land price stated by the user',
          },
        });
      }
      const hard = user.match(/\$\s?(\d{2,4})\s*(?:\/|per)\s*(?:gross\s*)?(?:sf|square foot)/i);
      if (hard)
        toolCalls.push({
          id: 'h',
          name: 'setInput',
          input: {
            path: 'costs.hard.perGrossSF',
            value: Number(hard[1]),
            source: 'quote',
            note: 'Contractor figure stated by the user',
          },
        });
      if (/\bowned\b/i.test(user) && !/not owned/i.test(user))
        toolCalls.push({
          id: 'o',
          name: 'setInput',
          input: {
            path: 'site.landOwned',
            value: true,
            source: 'my-number',
            note: 'Land is owned, per the user',
          },
        });
      const reply =
        toolCalls.length > 0
          ? 'Thanks. I have proposed the values you gave me below; confirm each one and I will keep going. What is the intended construction type, and do you have a target hold period?'
          : 'Tell me the address, the construction type, the number of units or target size, whether the land is owned, and any numbers you already have (land price, hard cost per square foot).';
      return this.fake.complete({ ...request }).catch(() => ({
        text: reply,
        toolCalls,
        usage,
        stopReason: toolCalls.length ? 'tool_use' : 'end_turn',
        model: 'scripted',
      }));
    }
    const payloadMatch = text.match(/\(JSON[^)]*\):\n([\s\S]*?)\n\n/);
    const data = parseJson(payloadMatch?.[1]);
    if (request.system.includes('explain one number')) {
      const trace = data.trace as {
        label: string;
        formula: string;
        value: number;
        unit: string;
        operands: Array<{ name: string; value: number | string | null; unit?: string }>;
      };
      const fmt = (v: number | string | null, unit?: string) =>
        typeof v !== 'number'
          ? String(v ?? '')
          : unit === 'rate_pct' || unit === 'pct'
            ? `${(v * 100).toFixed(2)}%`
            : unit === 'usd'
              ? `$${Math.round(v).toLocaleString('en-US')}`
              : String(v);
      const ops = trace.operands
        .slice(0, 3)
        .map((o) => `${o.name.toLowerCase()} of ${fmt(o.value, o.unit)}`)
        .join(', ');
      return {
        text: `${trace.label} is ${fmt(trace.value, trace.unit)}. It comes from ${trace.formula}: ${ops}. Changing those inputs moves this number.`,
        toolCalls: [],
        usage,
        stopReason: 'end_turn',
        model: 'scripted',
      };
    }
    if (request.system.includes('rule-based flag')) {
      const f = data as { message: string };
      return {
        text: f.message.endsWith('.') ? f.message : `${f.message}.`,
        toolCalls: [],
        usage,
        stopReason: 'end_turn',
        model: 'scripted',
      };
    }
    const n = data as {
      dealName: string;
      site: { town?: string };
      program: { totalUnits: number; gsfTotal: number };
      register: Array<{ label: string; value: unknown; unit: string; source: string }>;
      metrics: Record<string, Record<string, number | null>>;
    };
    const pct = (v: number | null | undefined) =>
      typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : 'n/a';
    const irrs = ['likely', 'best', 'worst']
      .map((k) => n.metrics[k]?.projectIrr ?? null)
      .filter((v): v is number => v !== null);
    const yocs = ['likely', 'best', 'worst']
      .map((k) => n.metrics[k]?.yieldOnCost ?? null)
      .filter((v): v is number => v !== null);
    const hard = n.register.find((r) => r.label.startsWith('Hard cost'));
    const narrative = `${n.dealName} is a ${n.program.totalUnits}-unit rental building of ${Math.round(n.program.gsfTotal).toLocaleString('en-US')} gross square feet${n.site.town ? ` in ${n.site.town}` : ''}. ${hard ? `Hard cost is $${Number(hard.value).toFixed(2)} per gross square foot (${hard.source}).` : ''} Across the Likely, Best and Worst scenarios the project IRR ranges from ${pct(Math.min(...irrs))} to ${pct(Math.max(...irrs))} and the yield on cost from ${pct(Math.min(...yocs))} to ${pct(Math.max(...yocs))}. Every assumption, its source and its date are listed in the assumptions register; this draft was prepared by the assistant from that register and the engine's outputs.`;
    return { text: narrative, toolCalls: [], usage, stopReason: 'end_turn', model: 'scripted' };
  }
}

function parseJson(raw: string | undefined): Record<string, unknown> {
  try {
    return JSON.parse(raw ?? '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

let cached: Provider | null | undefined;

/** The configured provider, or null when the assistant is not available. */
export function getProvider(): Provider | null {
  if (cached !== undefined) return cached;
  cached =
    process.env.PENCIL_ASSISTANT_FAKE === '1' ? new ScriptedProvider() : anthropicProviderFromEnv();
  return cached;
}
