/**
 * Structured logs (spec 14.1): one JSON line per event carrying the ids that matter (organization,
 * deal, version) and timings; errors also go to Sentry when SENTRY_DSN is set.
 */
type Fields = Record<string, unknown>;

function emit(level: 'info' | 'warn' | 'error', event: string, fields: Fields) {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields: Fields = {}) => emit('info', event, fields),
  warn: (event: string, fields: Fields = {}) => emit('warn', event, fields),
  error: (event: string, error: unknown, fields: Fields = {}) => {
    emit('error', event, {
      ...fields,
      message: error instanceof Error ? error.message : String(error),
    });
    if (process.env.SENTRY_DSN) {
      void import('@sentry/nextjs')
        .then((Sentry) => Sentry.captureException(error, { extra: { event, ...fields } }))
        .catch(() => undefined);
    }
  },
};
