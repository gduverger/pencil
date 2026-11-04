/**
 * The Anthropic provider: Claude through the official SDK, server-side only (spec 10, 11.2).
 * Thinking stays on at low effort (these are short configuring/explaining turns); server-side
 * refusal fallbacks are enabled by default; no sampling parameters are sent.
 */
import Anthropic from '@anthropic-ai/sdk';
import type {
  ContentBlock,
  Provider,
  ProviderRequest,
  ProviderResponse,
  ToolDefinition,
} from './provider';

export const DEFAULT_MODEL = 'claude-opus-5-5';

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high';
  /** Server-side refusal fallbacks (default on). */
  fallbacks?: boolean;
  /** Request timeout in milliseconds (default 60 s). */
  timeoutMs?: number;
}

type BetaParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

function toBlocks(content: ContentBlock[]): Anthropic.Beta.Messages.BetaContentBlockParam[] {
  return content.map((c) => {
    if (c.type === 'text') return { type: 'text', text: c.text };
    if (c.type === 'tool_use')
      return {
        type: 'tool_use',
        id: c.id,
        name: c.name,
        input: c.input as Record<string, unknown>,
      };
    return { type: 'tool_result', tool_use_id: c.toolUseId, content: c.content };
  });
}

function toTool(t: ToolDefinition): Anthropic.Beta.Messages.BetaTool {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
  };
}

/** The SDK request for a provider request (exported for tests; no network). */
export function toAnthropicRequest(
  request: ProviderRequest,
  opts: AnthropicProviderOptions = {},
): BetaParams & { betas: string[] } {
  const params: BetaParams & { betas: string[] } = {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: request.maxTokens ?? 1024,
    system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
    messages: request.messages.map((m) => ({ role: m.role, content: toBlocks(m.content) })),
    output_config: { effort: opts.effort ?? 'low' },
    betas: [],
  };
  if (request.tools && request.tools.length > 0) params.tools = request.tools.map(toTool);
  if (opts.fallbacks !== false) {
    params.betas.push('server-side-fallback-2026-07-01');
    params.fallbacks = 'default';
  }
  return params;
}

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  constructor(private readonly opts: AnthropicProviderOptions = {}) {
    this.client = new Anthropic({
      ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
      timeout: opts.timeoutMs ?? 60_000,
      maxRetries: 2,
    });
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const params = toAnthropicRequest(request, this.opts);
    try {
      const response = await this.client.beta.messages.create(params);
      let text = '';
      const toolCalls: ProviderResponse['toolCalls'] = [];
      if (response.stop_reason !== 'refusal') {
        for (const block of response.content) {
          if (block.type === 'text') text += block.text;
          else if (block.type === 'tool_use')
            toolCalls.push({ id: block.id, name: block.name, input: block.input });
        }
      }
      return {
        text,
        toolCalls,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        stopReason: response.stop_reason ?? 'end_turn',
        model: response.model,
      };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError)
        throw new ProviderError(
          'rate-limited',
          'The assistant is rate limited; try again in a moment.',
        );
      if (error instanceof Anthropic.AuthenticationError)
        throw new ProviderError('auth', 'The assistant API key is invalid.');
      if (error instanceof Anthropic.BadRequestError)
        throw new ProviderError('bad-request', error.message);
      if (error instanceof Anthropic.APIError)
        throw new ProviderError(
          'api',
          `Assistant API error ${error.status ?? ''}: ${error.message}`,
        );
      throw error;
    }
  }
}

export class ProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** A provider from the environment, or null when no credentials are configured. */
export function anthropicProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): Provider | null {
  if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN && env.PENCIL_ASSISTANT !== 'on')
    return null;
  return new AnthropicProvider({
    ...(env.PENCIL_ASSISTANT_MODEL ? { model: env.PENCIL_ASSISTANT_MODEL } : {}),
    effort: (env.PENCIL_ASSISTANT_EFFORT as 'low' | 'medium' | 'high' | undefined) ?? 'low',
  });
}
