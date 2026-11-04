# Progress

Milestone status per `docs/SPEC.md` section 13. Each entry names what was built, what was
verified, how it was verified, and what is left.

| Milestone | Status |
| --- | --- |
| M0 Scaffold | done (2026-11-04) |
| M1 Engine core | done (2026-11-04) |
| M2 Engine operations and capital | done (2026-11-04) |
| M3 Engine analysis and CLI | done (2026-11-04), golden tests pending workbooks |
| M4 Package pages and exports | done (2026-11-04) |
| M5 Web app: deals and inputs | done (2026-11-04) |
| M6 Web app: results, scenarios, sensitivities | done (2026-11-04) |
| M7 Web app: package, versions, sharing | done (2026-11-04) |
| M8 Benchmarks and parcels | done (2026-11-04), seed values pending Mark |
| M9 Assistant | not started |
| M10 Billing and launch | not started |

## M0 Scaffold — done 2026-11-04

**Built.** Monorepo per section 11.1: pnpm workspaces, Turborepo, TypeScript strict (Node 22),
ESLint flat config, Prettier, Vitest with fast-check for the engine; `apps/web` (Next.js 15.5,
React 19, Tailwind 4), `apps/render` (Playwright 1.63), `apps/cli`; seven packages with manifests,
source entry points and smoke tests; `docs/` (SPEC, decisions, progress, later, demos/m0);
`reference/README.md`; GitHub Actions CI running lint, typecheck and tests on every push and e2e
on `main`.

**Verified.** `pnpm lint`, `pnpm typecheck` and `pnpm test` pass on the clean tree (10 workspace
tasks each); `pnpm --filter @pencil/web build` produces a static Next.js build. Demo script:
`docs/demos/m0.md`.

**Left.** The five reference workbooks are not in `reference/` (not supplied); see below.

## M1 Engine core — done 2026-11-04

**Built.** `@pencil/engine`: zod schema with every default, unit, label, star and `elaborable`
flag (`schema.ts`, with `inputCatalog()` and JSON Schema generation); timeline phases; program
and revenue basis (7.3); cost lines with S-curve, straight-line and custom distributions, the
soft-cost split, carry windows, developer fee, commercial TI and elaborated hard/soft lines (7.4);
cost and inflow events with surplus carry-forward (7.5); the funding order (equity → mezzanine →
construction loan), land loan roll-in, in-kind land, capitalized interest and the TPC fixed point
with `EngineError('non-convergent')` (7.6); `validate`; sources & uses; capital budget;
`checkInvariants`; dotted-path get/set for scenarios.

**Verified.** `pnpm --filter @pencil/engine test`: 77 tests pass, line coverage 96% (threshold
95%). Hand-computed cases are written as comments in the tests (unit rounding, S-curve
symmetry, soft split 60/40 and P = 0, inflow carry-forward, mezz fee at first draw, land loan
roll). Invariants 1, 2 and 5 pass on eight deal variants; invariant 8 (byte-identical reruns)
passes. The fixture deal with 30 elaborated hard-cost lines runs in well under 50 ms (20-run
average asserted in `test/perf.test.ts`). `pnpm lint` and `pnpm typecheck` pass.

**Left.** Operations, permanent loan, sale, waterfall and metrics are M2; `run()` currently
returns zero operating series and no distributions.

## M2 Engine operations and capital — done 2026-11-04

**Built.** Lease-up and operations with linear and units-per-month absorption, commercial income
and opex, affordable rents, annual growth steps, management as % of EGI (7.7); permanent loan
sizing by LTV and DSCR, `amortize` with interest-only months, refinance proceeds or shortfall,
interest-only construction debt when the permanent switch is off (7.8); sale valuation, selling
costs and payoff with mezzanine repaid at refinance or sale (7.9); the IRR-hurdle waterfall with
per-partner, per-tier balances and sequential capacity (7.10); every 7.11 metric, DSCR and
cash-on-cash by year; `explain(outputs, cellRef)` traces for metrics, sale, refinance, totals,
program, monthly and annual cells (10.2); all five single-run invariants plus monotonicity and
determinism tests; fast-check property tests over random deals (12.4) with a regression fixture
directory.

**Verified.** `pnpm --filter @pencil/engine test`: 138 tests, 500 property cases, line coverage
98.6%. Hand-computed checks: $1M at 6%/30y pays $5,995.51; 24 IO rows; DSCR-sized loan gives a
first-year DSCR of exactly 1.25; the three-tier waterfall allocation on a 100/120 example (108 /
9 / 3); EGI, opex and NOI for the simple deal at month 18. The property tests found one real
defect (a fixed-point oscillation on the mezzanine fee), fixed and recorded in
`docs/decisions.md` and `test/regressions/`.

**Left.** Scenarios, sensitivities, residual land value and the CLI are M3.

## M3 Engine analysis and CLI — done 2026-11-04 (golden tests pending the workbooks)

**Built.** `runScenario` / `runScenarios` with Best and Worst override maps and default deltas
(FR-5), `sensitivity` grids with per-cell full runs, base-cell detection and the three presets of
FR-6.3, `residualLandValue` by bisection with bracket handling (7.12); the shared presentation
formatting module (`@pencil/package-pages/format`, 7.13 rounding rules); `apps/cli`: `pencil run
deal.json` writes `outputs.json`, `summary.json` and a plain HTML package with the headline range,
sources and uses, capital budget, annual cash flow, sale analysis, flags and the assumptions
register; an example deal in `apps/cli/examples/`; the golden harness: `scripts/extract-golden.py`
(openpyxl / pyxlsb, cell addresses recorded in the JSON), one mapping template per workbook,
`test/golden/` with adapter types, a template adapter and a test that replays any extracted model.

**Verified.** Engine: 148 tests (invariant 6 — Likely equals a plain run byte for byte and the
base sensitivity cell equals the scenario run; a 9 × 9 preset grid runs in well under 2 s; RLV
returns the land cost within $100 when the target equals the current yield). Format: 5 tests of
the 7.13 rules. CLI: 3 tests and a real run on the example deal; the HTML was rendered in
Chromium and reviewed (screenshot during the session). `pnpm lint`, `pnpm typecheck` and
`pnpm test` pass for all 10 workspaces.

**Left.** Golden tolerances cannot be met or measured until the workbooks are placed in
`reference/`; the harness reports them as skipped rather than silently passing. The CLI's PDF and
XLSX outputs arrive with M4.

## M4 Package pages and exports — done 2026-11-04

**Built.** `@pencil/package-pages`: the nine pages as React components sharing one print
stylesheet (Letter portrait, landscape cash-flow and appendix via a named `@page`), letterhead,
version and scenario in every header, hero range tiles, the NOI/debt-service bar chart and the
sources donut as inline SVG (palette validated with the data-viz checks), heat-shaded sensitivity
grids with the likely case outlined and stale grids omitted with a note, the assumptions register
with sources, notes, dates, benchmarks, flags and scenario overrides, the amortization appendix
with an optional monthly schedule, `renderPackageHtml`, `planPages`, `registerFromInputs` and the
7.13 formatting module. `@pencil/render`: `htmlToPdf` / `urlToPdf` with Chromium (page numbers in
the PDF footer template), an HTTP service with a shared token, page-PNG capture, and Playwright
snapshot tests. `@pencil/exports`: the seven-sheet workbook with `SUM` formulas for totals,
subtotals and NOI, amortization roll-forward formulas, 7.13 number formats, frozen headers and
the snapshot cover note; the PDF client for the render service. `apps/cli` now renders the React
package and takes `--pdf` and `--xlsx`.

**Verified.** 10 workspaces pass lint, typecheck and tests (`pnpm test`, 177 tests). The fixture
package renders to an 11-page Letter PDF in about one second after browser start (asserted under
10 s), with both 612×792 and 792×612 media boxes present. Every page was rasterized and reviewed by
eye (`docs/demos/m4/page-*.png`, notes in `docs/demos/m4.md`); the review found and fixed a
duplicated in-page footer, wrapping dates in the register and a 9 px overflow at phone width.
Playwright snapshots for the nine pages plus the phone view are committed under
`apps/render/test/__snapshots__/`. The workbook was reopened with exceljs: seven sheets, totals are
`SUM` formulas, formats match 7.13, the Annual sheet's EGI and opex sums reproduce the engine's
annual NOI to full precision. Sources & uses totals equal TPC after independent rounding.

**Left.** The web app's package routes (M7) will render the same components; the render service
needs Inter installed in its production image (a Dockerfile arrives with M10's deploy work).

## M5 Web app: deals and inputs — done 2026-11-04

**Built.** `@pencil/db`: Drizzle schema for every table of 11.3 (plus Auth.js tables), embedded
migrations, PGlite/Postgres client, the deal-state document with pure functions for patches with
append-only history (FR-1), elaboration with the auto-balancing remainder (FR-2), switches that keep
hidden values (FR-3), events (FR-4), scenario overrides (FR-5), stale sensitivities (FR-6), clone
with history reset, and organization-scoped queries with rev-checked transactional updates.
`@pencil/parcels`: a 46-town Massachusetts table (cluster, approximate FY2025 residential rate,
assessor URL, MBTA status), address parsing and the documented parcel-lookup stub.
`@pencil/benchmarks`: schema, the empty seed template with every row of 9.2, CSV loader, segment
resolution with fallback, defaults, flags and percentiles. `apps/web`: Auth.js (email link,
Google, development sign-in), personal organizations, deal list with clone and templates, new
deal from address (town → cluster, tax-rate default for stabilized taxes, parcel facts with
`unknown` sources), Setup screen, Inputs screen in Tonight / All modes with value, unit, source,
note, timestamp, history panel, benchmark range and flag on every input, elaboration editor with
paste of a column, events, switches, waterfall tiers, unit-mix CSV import, scenario overrides,
keyboard navigation and autosave with a revision-conflict banner; organization settings.

**Verified.** 201 unit tests across 10 workspaces (engine 150 with property tests, db 16 on
PGlite, benchmarks 9, parcels 6, package-pages 10, exports 3, cli 3, render 2), `pnpm lint` and
`pnpm typecheck` clean, `next build` succeeds. End-to-end (Playwright against the production
build with PGlite and the development sign-in): steps 1–6 of section 5 pass — create from a
Needham address, defaults shown, two inputs changed with notes (history rows appended and
listed), hard cost elaborated into three children with the remainder, an inflow event, commercial
switched on and off with the value retained, everything surviving a reload; a concurrent edit with
a stale revision shows the conflict banner and nothing is overwritten; unauthenticated access
redirects to sign-in. The property tests also surfaced a real engine issue during this milestone
(a two-cycle in the TPC fixed point when the first mezzanine draw month flips), now resolved and
recorded in `docs/decisions.md` with a regression fixture.

**Left.** Benchmarks are empty until Mark's seed arrives, so every default shows source `unknown`
and no flags fire; Google and email sign-in are configured but untested without credentials;
inviting members is not yet on the settings screen.

## M6 Web app: results, scenarios, sensitivities — done 2026-11-04

**Built.** The Results screen: the engine runs in the browser on every change for all three
scenarios; headline tiles with Likely plus Best and Worst; sections for Returns, Sources & uses,
Capital budget, Annual cash flow and Sale analysis rendered by the same page components as the
PDF; a scenario selector and a *Compare all three* toggle that lays the three scenarios side by
side; a quick-inputs panel of the twelve tonight inputs with autosave through the same patches as
the Inputs screen (overrides when Best or Worst is selected); flags; the sensitivities panel with
the three presets, a custom two-input grid builder, server-side runs saved with the deal,
heat-shaded grids with the likely case outlined, stale marking on any input change and re-run;
an explain panel showing the engine's derivation trace for any headline number.

**Verified.** End-to-end (`e2e/results.spec.ts`): an input change updates the results tile in
under 200 ms (asserted from the keypress to the DOM change); a Worst override shows beside Likely
and reads lower; compare shows three columns; the exit-cap × rent-growth preset produces a 9 × 5
grid with the likely cell outlined, goes stale on an input change, is fresh again after re-run and
survives a reload; the explain panel shows the yield-on-cost formula. Steps 1–6 still pass.
Lint, typecheck and the unit suites are clean.

**Left.** Sensitivities and explain traces appear in the package with M7; the assistant's
sentences for explain and flags arrive with M9.

## M7 Web app: package, versions, sharing — done 2026-11-04

**Built.** The Package screen: page toggles, scenario for detail pages, monthly appendix toggle,
cover note and narrative, letterhead from organization settings, a live preview rendered by the
same components as the PDF; *Export PDF* and *Export Excel* create an immutable Version (inputs
with metadata, switches, events, scenarios, engine outputs, sensitivities, package settings,
engine version) and the file, served through short-lived signed URLs; the token-protected package
route `/packages/<versionId>` that Chromium renders (through the render service when configured,
in-process otherwise); file storage on S3-compatible buckets or the local filesystem; read-only
share links (32 random bytes) with optional expiry and revocation, a share viewer with no sign-in
and downloads of both files generated on demand from the Version; *Diff versions* listing changed
inputs (path, old, new, note, who, when) and changed headline metrics; the reviewed flag for the
reviewer role; entitlement checks at export and share time (Pro by default outside production
until M10). Clone and templates were built in M5.

**Verified.** End-to-end (`e2e/package.spec.ts`): two notes entered, Export PDF creates Version 1
with a signed PDF download (checked to be a real PDF), Export Excel creates Version 2 with the
workbook, Diff compares the two, a share link opens in a logged-out phone-width context (375 px,
no horizontal scroll), its assumptions register shows both notes, both files download from the
share, and after revocation the link returns 404. Steps 1–8 still pass; lint, typecheck and the
unit suites are clean.

**Left.** Letterhead image upload is a settings field (data URL) rather than object storage; the
render service deployment and R2 bucket are M10 launch work.

## M8 Benchmarks and parcels — done 2026-11-04 (seed values pending Mark)

**Built.** Town table (46 Massachusetts towns with cluster, approximate FY2025 residential tax
rate, assessor URL and MBTA Communities status) loaded into `towns` on first connection; the
documented parcel-lookup stub (fields empty with source `unknown`, town facts and notes still
supplied); benchmark resolution by segment with fallback and unit-type inference from the path;
defaults at deal creation; out-of-range flags beside the field, in the header count, in the
assumptions register (with the range sentence of 9.4) and counted on the Returns page; opt-in
contribution on export (metric, segment keys, value, export month — no address, name or text);
the nightly recompute (`POST /api/jobs/benchmarks` with the jobs secret, or `pnpm --filter
@pencil/web nightly`) writing 25th/50th/75th percentile ranges once a segment has five
contributions from three organizations; an extra seed CSV hook (`PENCIL_SEED_BENCHMARKS`) for
demos and tests.

**Verified.** Unit: db 18 tests (contribution rows contain only the four allowed fields and no
address, name or note text; the recompute refuses 4 deals from 2 organizations, writes 310 / 340 /
350 for five values from three, and is idempotent), benchmarks 9, parcels 6. End-to-end
(`e2e/benchmarks.spec.ts`): a Needham address resolves inner-suburbs and the tax-rate default; the
seeded range defaults hard cost to 320 with source `benchmark`; 500 shows the *outside range* flag,
the count, the register sentence and the Returns-page count while results keep running; the job
endpoint rejects a missing secret. All seven e2e tests pass.

**Left.** The seed table has no values until Mark provides them (every default is a schema default
with source `unknown`; flags are disabled for metrics with no seed); the statewide parcel dataset is
not loaded, so lot area, zoning, assessed value and current tax come from the user.

## Blockers and gaps

- **Reference workbooks missing.** `reference/` is empty because the five workbooks listed in
  section 12.3 were not supplied with the specification. Golden tests (12.3) cannot run against
  cached workbook values until they are added. See `reference/README.md`.
