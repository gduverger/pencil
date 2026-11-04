/** The assistant's only way to change a deal: `setInput` tool calls, validated against the engine schema (10.1, 10.5). */
import { catalogEntry, inputCatalog, SOURCES, type Source } from '@pencil/engine';
import type { ToolDefinition } from './provider';

export interface SetInputCall {
  path: string;
  value: number | string | boolean;
  source: Exclude<Source, 'calculated'>;
  note: string;
}

export function setInputTool(): ToolDefinition {
  const paths = inputCatalog().map((e) => `${e.path} — ${e.label} (${e.unit})`);
  return {
    name: 'setInput',
    description: `Propose a value for one deal input. The user confirms each proposal before it is written; nothing is written silently. Percentages are decimal fractions (0.08 for 8%). Paths:\n${paths.join('\n')}`,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The dotted input path, exactly as listed.' },
        value: {
          description: 'The value in the input unit (number, text or boolean).',
          anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }],
        },
        source: {
          type: 'string',
          enum: SOURCES.filter((s) => s !== 'calculated'),
          description:
            "Where the number comes from: my-number, quote, comp, benchmark, parcel-data or unknown. Never 'calculated'.",
        },
        note: { type: 'string', description: 'Why this value, from where, one sentence.' },
      },
      required: ['path', 'value', 'source', 'note'],
      additionalProperties: false,
    },
  };
}

export interface ValidatedCalls {
  accepted: SetInputCall[];
  rejected: Array<{ input: unknown; reason: string }>;
}

/** Validate tool calls against the schema: known path, value type per unit, allowed source. */
export function validateSetInputCalls(
  calls: Array<{ name: string; input: unknown }>,
): ValidatedCalls {
  const accepted: SetInputCall[] = [];
  const rejected: ValidatedCalls['rejected'] = [];
  for (const call of calls) {
    if (call.name !== 'setInput') {
      rejected.push({ input: call.input, reason: `unknown tool ${call.name}` });
      continue;
    }
    const input = call.input as Partial<SetInputCall> | null;
    if (!input || typeof input.path !== 'string') {
      rejected.push({ input, reason: 'missing path' });
      continue;
    }
    const entry = catalogEntry(input.path);
    if (!entry) {
      rejected.push({ input, reason: `unknown input path ${input.path}` });
      continue;
    }
    let value = input.value;
    if (entry.unit === 'flag') {
      if (typeof value === 'string') value = /^(true|yes|on|1)$/i.test(value);
      if (typeof value !== 'boolean') {
        rejected.push({ input, reason: `${input.path} needs true or false` });
        continue;
      }
    } else if (entry.unit === 'text') {
      if (typeof value !== 'string') {
        rejected.push({ input, reason: `${input.path} needs text` });
        continue;
      }
    } else {
      if (typeof value === 'string') value = Number(value.replace(/[$,%\s]/g, ''));
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        rejected.push({ input, reason: `${input.path} needs a number` });
        continue;
      }
      if ((entry.unit === 'pct' || entry.unit === 'rate_pct') && value > 1.5) value = value / 100; // "8" meant 8%
    }
    const candidate: string = typeof input.source === 'string' ? (input.source as string) : '';
    const source: SetInputCall['source'] =
      candidate !== 'calculated' && (SOURCES as readonly string[]).includes(candidate)
        ? (candidate as SetInputCall['source'])
        : 'my-number';
    accepted.push({
      path: input.path,
      value: value as number | string | boolean,
      source,
      note: typeof input.note === 'string' ? input.note : '',
    });
  }
  return { accepted, rejected };
}
