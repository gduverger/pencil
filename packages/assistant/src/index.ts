// @pencil/assistant — the AI layer (spec 10): provider interface, tools, prompts, post-checks.
export * from './provider';
export { FakeProvider } from './fake';
export type { RecordedResponse } from './fake';
export { extractNumbers, numbersInData, tokenMatches, checkNumbers } from './postcheck';
export type { NumberToken, PostCheckResult } from './postcheck';
export { setInputTool, validateSetInputCalls } from './tools';
export type { SetInputCall, ValidatedCalls } from './tools';
export * from './prompts';
export * from './assistant';
export { AnthropicProvider, anthropicProviderFromEnv, toAnthropicRequest } from './anthropic';
export type { AnthropicProviderOptions } from './anthropic';
