/**
 * The model provider interface (spec 10): one server-side module with a swappable provider. The
 * model configures, checks and explains; it never computes. Every request carries the engine's
 * numbers as data, and every response passes the number post-check before it is shown.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string };

export interface ProviderMessage {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

export interface ProviderRequest {
  system: string;
  messages: ProviderMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ProviderResponse {
  text: string;
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string;
  model: string;
}

export interface Provider {
  readonly name: string;
  complete(request: ProviderRequest): Promise<ProviderResponse>;
}

/** Per-organization token and request budgets (10.5). */
export interface Budget {
  /** Throws or returns false when the organization is over budget for the month. */
  allow(orgId: string, estimatedTokens: number): Promise<boolean>;
  record(orgId: string, usage: { inputTokens: number; outputTokens: number }): Promise<void>;
}

export const UNLIMITED_BUDGET: Budget = {
  allow: async () => true,
  record: async () => undefined,
};
