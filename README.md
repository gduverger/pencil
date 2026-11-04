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
