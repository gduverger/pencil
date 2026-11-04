# Deploying Pencil

Spec 11.2 hosting: Vercel (web), Neon (Postgres), Cloudflare R2 (files), Fly.io (render service),
Stripe (billing), Sentry (errors). Everything below is driven by environment variables listed in
`apps/web/.env.example`; nothing is hard-coded to a provider.

## 1. Database — Neon

1. Create a project (Postgres 17) and copy the pooled connection string.
2. Set `DATABASE_URL=postgres://…?sslmode=require` on the web app. Migrations are embedded in
   `@pencil/db` and run on first connection (`pencil_migrations` records what was applied); the
   town table and the benchmark seed are loaded on first connection too.
3. Backups: Neon keeps point-in-time history; in addition `.github/workflows/backup.yml` runs
   `scripts/backup.sh` nightly (03:17 Boston) and stores a `pg_dump` custom-format file under
   `backups/` in the files bucket and as a 14-day workflow artifact. Repository secrets:
   `DATABASE_URL`, `S3_BUCKET`, `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
4. Restore: `DATABASE_URL=… scripts/restore.sh backups/pencil-YYYY-MM-DD.dump` into an empty
   database (it drops and recreates objects). The drill below rehearses the whole cycle.

## 2. Files — Cloudflare R2

Create a bucket and an API token with object read/write. Set `S3_BUCKET`, `S3_ENDPOINT`
(`https://<account>.r2.cloudflarestorage.com`), `S3_REGION=auto`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`. Files are served only through short-lived signed URLs of the web app
(`/api/files/<id>?t=…`), never directly from the bucket.

## 3. Render service — Fly.io

```bash
fly launch --no-deploy --copy-config --config apps/render/fly.toml --dockerfile apps/render/Dockerfile
fly secrets set RENDER_TOKEN=$(openssl rand -hex 24) SENTRY_DSN=… --config apps/render/fly.toml
fly deploy --config apps/render/fly.toml --dockerfile apps/render/Dockerfile .
```

The image is the Playwright 1.63 Chromium image plus the Inter font; `GET /healthz` is the health
check, `POST /render` takes `{ url, footerText, versionId }` with `x-render-token`. On the web app
set `PENCIL_RENDER_URL=https://pencil-render.fly.dev` and the same `RENDER_TOKEN`. Without
`PENCIL_RENDER_URL` the web app drives Chromium in-process (local development only).

## 4. Web app — Vercel

Root directory `apps/web`, framework Next.js, Node 22, install command `pnpm install
--frozen-lockfile`, build command `pnpm build` (turbo builds the workspace packages it transpiles).
Environment variables (production): `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `PENCIL_BASE_URL`,
`EMAIL_SERVER`, `EMAIL_FROM`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, the `S3_*` and `AWS_*`
variables, `PENCIL_RENDER_URL`, `RENDER_TOKEN`, the `STRIPE_*` variables, `ANTHROPIC_API_KEY`,
`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `CRON_SECRET`. Never set `PENCIL_DEV_AUTH` or
`PENCIL_DEFAULT_TIER` in production: the tier defaults to Free there.

`apps/web/vercel.json` schedules the nightly benchmark job (`/api/jobs/benchmarks`, 07:17 UTC);
Vercel sends `CRON_SECRET` as a bearer token and the route checks it.

## 5. Billing — Stripe

1. Products and prices: **Per-deal** one-time $199 (`STRIPE_PRICE_PER_DEAL`) and **Pro** recurring
   $2,400 / year (`STRIPE_PRICE_PRO`). Set `STRIPE_SECRET_KEY`.
2. Webhook endpoint `https://<host>/api/billing/webhook` with the events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`,
   `customer.subscription.deleted`; set its signing secret as `STRIPE_WEBHOOK_SECRET`.
3. Enable the customer portal in the Stripe dashboard (the *Manage billing* button on Settings).
4. Locally: `stripe listen --forward-to localhost:3000/api/billing/webhook` and `stripe trigger
   checkout.session.completed`; or post a self-signed event as `apps/web/e2e/billing.spec.ts` does.

What the webhook does: a paid Per-deal session writes an `entitlements` row for that deal valid
12 months; a Pro session writes an organization-wide row to the subscription's period end, sets
the organization tier to `pro` and stores the Stripe customer id; each renewal invoice adds a row
to the end of the paid period; a deleted subscription sets the tier back to `free` while the paid
rows keep access to their date. Every event id is recorded in `billing_events`, so redeliveries are
acknowledged and ignored. Exports and share links check `entitlements` on every call (FR-10.2).

## 6. Observability — Sentry and logs

Set `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (browser) on the web app and `SENTRY_DSN`
on the render service; without them nothing is initialised. Source maps are not uploaded (no
`withSentryConfig` wrapper; add it with `SENTRY_AUTH_TOKEN` when symbolicated stack traces matter).
Every export, render, billing event and assistant failure is one JSON log line with the
organization, deal and version ids and the time taken (`event: export`, `export.file`, `render`,
`billing.event`, …), readable in the Vercel and Fly log drains.

## 7. Assistant — Anthropic

`ANTHROPIC_API_KEY`, optional `PENCIL_ASSISTANT_MODEL` (default `claude-opus-5-5`), and the monthly
budgets `PENCIL_ASSISTANT_MONTHLY_TOKENS` / `PENCIL_ASSISTANT_MONTHLY_REQUESTS` per organization.

## 8. Restore drill (spec 14.1, done once before launch)

`scripts/restore-drill.sh` starts a scratch PostgreSQL cluster, runs the migrations, writes an
organization and a deal, backs up with `scripts/backup.sh`, drops the database, restores with
`scripts/restore.sh` and verifies the deal, its history rows and the migration ledger came back.

Record — 2026-11-04, PostgreSQL 16.15, run from the repository root:

```
1. migrate and write a deal      deal a4ac1121-…
2. back up                       wrote pencil.dump (36K)
3. destroy the database
4. restore                       restored pencil.dump into the database
5. verify                        deal name: 'Restore drill'; history rows: 80; migrations recorded: 2
PASS: restore drill succeeded
```

The first run failed before the backup step: the migration runner read query results in the
embedded database's shape only and crashed on a real Postgres connection. Fixed in
`@pencil/db` (`rowsOf`) and re-run; the drill is now part of the launch checklist.

## 9. Launch checklist

- [ ] Neon database created, `DATABASE_URL` set, first deploy ran the migrations
- [ ] R2 bucket and token; a PDF export downloads through the signed URL
- [ ] Render service deployed; `GET /healthz` returns `{ ok: true }`; an export records `render` with a `versionId`
- [ ] Stripe prices, webhook and portal configured; a test-mode purchase unlocks a deal within one webhook cycle
- [ ] Sentry DSNs set; a thrown test error appears in both projects
- [ ] Nightly backup workflow ran once by hand (`workflow_dispatch`) and the file is in the bucket
- [ ] `scripts/restore-drill.sh` passed on the launch build (record above)
- [ ] `PENCIL_DEV_AUTH` and `PENCIL_DEFAULT_TIER` are absent from production
