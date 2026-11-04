/**
 * The only error class the engine throws. `code` is stable and machine-readable; `details`
 * carries data for diagnostics (for example the last two fixed-point iterations).
 */
export class EngineError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message?: string, details?: unknown) {
    super(message ?? code);
    this.name = 'EngineError';
    this.code = code;
    this.details = details;
  }
}
