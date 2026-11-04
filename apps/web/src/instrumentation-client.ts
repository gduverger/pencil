import * as Sentry from '@sentry/nextjs';

/** Sentry in the browser when NEXT_PUBLIC_SENTRY_DSN is set at build time. */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({ dsn, environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development', tracesSampleRate: 0.1 });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
