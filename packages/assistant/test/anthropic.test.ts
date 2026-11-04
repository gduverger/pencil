import { describe, expect, it } from 'vitest';
import { anthropicProviderFromEnv, DEFAULT_MODEL, toAnthropicRequest } from '../src/anthropic';
import { setInputTool } from '../src/tools';

describe('Anthropic adapter request mapping (no network)', () => {
  it('maps a provider request to the SDK shape with the default model, low effort, fallbacks and no sampling parameters', () => {
    const params = toAnthropicRequest({
      system: 'sys',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      tools: [setInputTool()],
      maxTokens: 500,
      temperature: 0.2,
    });
    expect(params.model).toBe(DEFAULT_MODEL);
    expect(params.max_tokens).toBe(500);
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(params.betas).toContain('server-side-fallback-2026-07-01');
    expect(params.fallbacks).toBe('default');
    expect(params.tools?.[0]).toMatchObject({ name: 'setInput' });
    expect('temperature' in params).toBe(false);
    expect('thinking' in params).toBe(false);
    expect(params.system).toEqual([
      { type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('maps tool_use and tool_result blocks and honours a model override without fallbacks', () => {
    const params = toAnthropicRequest(
      {
        system: 's',
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 't1', name: 'setInput', input: { path: 'x' } }],
          },
          { role: 'user', content: [{ type: 'tool_result', toolUseId: 't1', content: 'ok' }] },
        ],
      },
      { model: 'claude-sonnet-5-5', fallbacks: false, effort: 'medium' },
    );
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.betas).toEqual([]);
    expect(params.fallbacks).toBeUndefined();
    expect(params.messages[0]!.content).toEqual([
      { type: 'tool_use', id: 't1', name: 'setInput', input: { path: 'x' } },
    ]);
    expect(params.messages[1]!.content).toEqual([
      { type: 'tool_result', tool_use_id: 't1', content: 'ok' },
    ]);
    expect(params.output_config).toEqual({ effort: 'medium' });
  });

  it('returns no provider without credentials', () => {
    expect(anthropicProviderFromEnv({})).toBeNull();
    expect(anthropicProviderFromEnv({ ANTHROPIC_API_KEY: 'sk-test' })?.name).toBe('anthropic');
  });
});
