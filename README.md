# Pencil

Pencil takes a Massachusetts multifamily site and about a dozen assumptions and produces a
bank-and-partner-ready feasibility package. Every number comes from a tested calculation engine,
every assumption carries a source, a date and a benchmark check, and the answer is always a range.

The complete product requirements and technical specification are in [`docs/SPEC.md`](docs/SPEC.md).
Milestone status is in [`docs/progress.md`](docs/progress.md); recorded decisions are in
[`docs/decisions.md`](docs/decisions.md).

## Layout

```
apps/web            Next.js app: deal screens, share viewer, package routes, server actions
apps/render         Playwright + Chromium service that renders package routes to PDF
apps/cli            `pencil run deal.json` → outputs JSON, package HTML, PDF, XLSX
packages/engine     @pencil/engine — pure calculation engine (spec section 7)
packages/package-pages  React components for the nine package pages
packages/benchmarks Massachusetts benchmark schema, loader, resolution, flags
packages/parcels    Massachusetts town table, tax rates, parcel lookup
packages/assistant  Assistant layer over engine inputs and outputs
packages/db         Drizzle schema, migrations, typed queries
packages/exports    XLSX builder and PDF client
reference/          Reference workbooks for golden tests
docs/               SPEC.md, decisions.md, progress.md, later.md, demos/
```

## Getting started

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

Node 22 and pnpm 10 are required (`corepack enable` installs the pinned pnpm).

## Running the web app locally

```bash
cp apps/web/.env.example apps/web/.env.local   # optional: everything has a local default
pnpm --filter @pencil/web dev                  # embedded PGlite database, development sign-in, Pro tier
```

`apps/web/.env.example` lists every variable: database, sign-in, file storage, the render service,
Stripe billing, the assistant and Sentry. Deployment (Vercel, Neon, R2, Fly.io, Stripe, Sentry),
nightly backups and the restore drill are in [`docs/deploy.md`](docs/deploy.md).

## Verification

```bash
pnpm lint && pnpm typecheck && pnpm test     # unit, invariant, property and golden tests
pnpm --filter @pencil/render test:snapshots  # PDF snapshots
pnpm --filter @pencil/web build && pnpm test:e2e   # the nine-step walkthrough and the billing gating
scripts/restore-drill.sh                     # backup and restore rehearsal
```
