import * as Sentry from '@sentry/nextjs';

/** Sentry on the server (spec 14.1) when SENTRY_DSN is set; nothing is initialised otherwise. */
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
  });
}

export const onRequestError = Sentry.captureRequestError;
