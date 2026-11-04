# Decisions

One dated entry per decision, with the alternative that was rejected. Entries are added when the
spec (`docs/SPEC.md`) is ambiguous and the simplest reading consistent with section 2 was chosen.
Decisions that would change the data model or the money math are flagged **ASK** and were not made
silently.

## 2026-11-04 — zod is the engine's only runtime dependency

Section 1 says the engine has "no dependencies beyond the standard library"; section 11.2 says the
zod schema in `@pencil/engine` is the source of truth for `DealInputs`. Chosen: zod is the single
declared runtime dependency of the engine, used only to parse, default and validate inputs; no
arithmetic touches it. Rejected: hand-written validators and a separate JSON Schema, which would
duplicate every default and `elaborable` flag in two places.

## 2026-11-04 — Library packages export TypeScript source, no build step

Workspace packages (`@pencil/*`) export `src/index.ts` directly; consumers transpile (Vitest, tsx,
Next.js `transpilePackages`). Rejected: `tsc` builds to `dist/` with Turborepo ordering — more
moving parts and slower iteration with no benefit at V1 scale. `pnpm build` therefore builds only
the Next.js app.

## 2026-11-04 — Next.js pinned to 15.x, Playwright pinned to 1.63.0

The spec names Next.js 15; 16 is current on npm. Next 15.5 is used so the spec's stack holds.
Playwright is pinned to 1.63.0 because that is the version whose Chromium is present in the build
environment (`PLAYWRIGHT_BROWSERS_PATH`). Rejected: floating to latest, which would need a browser
download the environment cannot do.

## 2026-11-04 — PGlite for local development and tests, Postgres (Neon) in production

`@pencil/db` targets Postgres through Drizzle. Locally and in tests it runs on PGlite (Postgres
compiled to WebAssembly) so the same migrations and queries run without a database server.
Rejected: SQLite for local use — a different SQL dialect from production would make the schema
and queries diverge.

## 2026-11-04 — Reference workbooks are not in the repository yet

The five Excel workbooks named in section 12.3 were not provided with the specification. The
golden-test harness (`scripts/extract-golden.py`, `packages/engine/test/golden/`) is built to the
spec's JSON format and documented; the adapters are written when the files are placed in
`reference/`. This is recorded in `docs/progress.md` and `reference/README.md` rather than skipped
silently.
