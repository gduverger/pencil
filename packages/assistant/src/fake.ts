/** A provider that replays recorded responses, for tests and for running without an API key. */
import type { Provider, ProviderRequest, ProviderResponse } from './provider';

export type RecordedResponse = Partial<ProviderResponse> & { text: string };

export class FakeProvider implements Provider {
  readonly name = 'fake';
  readonly requests: ProviderRequest[] = [];
  private queue: RecordedResponse[];

  constructor(responses: RecordedResponse[] = []) {
    this.queue = [...responses];
  }

  push(...responses: RecordedResponse[]) {
    this.queue.push(...responses);
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    this.requests.push(request);
    const next = this.queue.shift();
    if (!next) throw new Error('FakeProvider: no recorded response left');
    return { text: next.text, toolCalls: next.toolCalls ?? [], usage: next.usage ?? { inputTokens: 100, outputTokens: 50 }, stopReason: next.stopReason ?? (next.toolCalls?.length ? 'tool_use' : 'end_turn'), model: next.model ?? 'fake' };
  }
}
