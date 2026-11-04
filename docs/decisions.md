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

## 2026-11-04 — Percent fields are decimal fractions

Every `*Pct` input (rates, shares, cap rates) is a decimal fraction: 0.08 means 8%. The spec's
examples (`closingCostPct` default 0.02, `r / 12`) use this convention; the `pct` and `rate_pct`
units format it as a percentage for display. Rejected: whole-number percentages, which would put a
`/ 100` in every formula.

## 2026-11-04 — A `flag` unit for boolean inputs

FR-1.1 lists no unit for booleans (`landOwned`, `capitalizeOperatingDeficits`, switch `enabled`
fields). The catalog uses `flag` for them so every leaf input has a unit. Rejected: `text`, which
would format true/false as free text.

## 2026-11-04 — Elaborated lines reach the engine as `costs.hard.lines` / `costs.soft.lines`

Spec 7.2 says an elaborable input "may be replaced by a list of children `{ label, amount,
distribution? }`". The engine accepts an optional `lines` array next to the hard and soft cost
inputs; when present the parent total is their sum (in dollars), each hard line keeps its own
distribution over the construction window, and a soft line with its own distribution spreads over
the whole development window `[0, O)`. Opex and carry lines are elaborated in the app and reach the
engine as resolved totals (the sum is computed with the engine's own helper). Rejected: a generic
children structure on every elaborable path, which would make the engine know the UI's tree.

## 2026-11-04 — Affordable units are a fractional share of each type

`program.affordable.pctUnits` applies as a fraction of every unit type's count (6 one-bedrooms at
20% affordable contribute 1.2 affordable units), so GPR is `units × rent × (1 − pct × discount)`.
Rejected: rounding affordable units per type, which needs a second allocation rule and changes
GPR discontinuously.

## 2026-11-04 — Loans draw whenever the funding order reaches them

The construction loan and mezzanine draw in any month once equity (then mezzanine) is exhausted;
the engine does not forbid construction-loan draws before month P. The loan fee is still charged
at P as the spec says. Rejected: a hard rule that the loan is unavailable before P, which would
need a fourth funding source for the predevelopment shortfall of thinly capitalized deals.

## 2026-11-04 — The development period ends at R, which is Z when there is no permanent loan

Costs, capitalized interest and lease-up deficits run through the refinance month R. When the
permanent loan switch is off, R = Z (stabilization): from then on the construction loan is
interest-only and paid from NOI until the sale (7.8). Operating deficits are capitalized for
months in [O, R); NOI at R itself belongs to the operating regime. Rejected: ending capitalization
at O or at Z regardless of the refinance offset, which contradicts 7.4's `[O, R)` window.

## 2026-11-04 — Surplus inflows left at R are distributed at R

An inflow (or positive lease-up NOI) that exceeds every later requirement is carried forward
(7.5) and whatever remains at R is distributed through the waterfall at R. Sources & uses shows
inflows and lease-up NOI at the amounts actually applied to costs, so the statement balances to
the cent. Rejected: paying the surplus down against the loan, which the spec does not describe.

## 2026-11-04 — The permanent loan fee is netted from refinance proceeds, not capitalized

Spec 7.8 nets the fee from the refinance: `L_perm − fee − payoff`. It is therefore not part of
TPC and appears on the sale/refinance pages, not in sources & uses (where the permanent loan is a
memo line). Rejected: treating it as a capitalized financing fee, which would double count it.

## 2026-11-04 — Capitalized interest is a cost but not a cash requirement

Interest accrues into each loan's balance (7.6: `B_t = B_{t−1} + D_t + I_t`) and counts in TPC,
so the monthly requirement funded in order excludes it. Sources & uses carries it as a use funded
by the loan balance. Rejected: drawing the loan to pay its own interest, which doubled the balance.

## 2026-11-04 — Mezzanine fee: at first draw, or at P if the tranche is never drawn

Spec 7.6 charges the mezzanine fee "at first draw". A tranche that is never drawn (equity plus
inflows cover the requirement) would then pay no fee, and because the fee is part of TPC the
fixed point could flip between "draws" and "does not draw" every iteration. The property tests
found exactly that (`test/regressions/mezz-fee-oscillation.json`). The fee is now charged at the
first draw whenever a draw happens, and at month P as a commitment fee when the tranche is never
drawn, which makes the TPC map continuous. Rejected: dampening the iteration, which would still
not define a TPC the funding order can reproduce.

## 2026-11-04 — Mezzanine repaid at sale is serviced interest-only after R

Mezzanine interest is capitalized through R (it is a project cost). When `repaidAt = 'sale'`, or
when there is no permanent loan, the balance stays outstanding and its interest is paid from
operating cash flow with the senior debt service until the sale payoff. Rejected: capitalizing
mezzanine interest after R, which would put a capitalized cost after R (invariant 5).

## 2026-11-04 — NOI at the refinance month belongs to the operating regime

Deficits are capitalized for months in [O, R) as 7.4 states; NOI(R) nets against the refinance
proceeds (or shortfall) in the month-R cash flow, and the first permanent-loan payment falls at
R + 1. Rejected: capitalizing a month-R deficit, which would contradict the `[O, R)` window.

## 2026-11-04 — Unlevered IRR includes inflow events as positive flows

7.11 defines the unlevered series as costs excluding loan fees and interest, NOI from O and the
net sale value. Operating deficits are excluded from the cost side because they are already the
negative NOI months, and inflow events are included as positive flows because they are real
project cash. Rejected: leaving inflows out, which would understate the unlevered return of a deal
whose one-off sale (a relocated house) is a genuine inflow.

## 2026-11-04 — Annual tables are twelve-month periods from month 0, with a final stub

Per 14.3, year 1 is months 0–11. A 120-month hold therefore has ten full years and an eleventh
one-month period holding the sale; it is marked `partial` and labeled as the sale period on the
cash-flow page. Rejected: calendar years, and shifting year 1 to months 1–12 so the sale lands at
the end of year 10 (which would leave month 0 as its own stub instead).

## 2026-11-04 — A sensitivity cell that fails validation is recorded, not thrown

A grid can sweep a value that makes a cell invalid (for example a hold shorter than
stabilization). The cell then carries `error` and null metrics and the grid counts it in
`errors`; the rest of the grid still computes. Rejected: failing the whole grid, which would hide
80 valid cells behind one bad corner.

## 2026-11-04 — Residual land value brackets

7.12 bisects on `[0, 5 × landCost]`. When the deal has no land cost the bracket top is the total
project cost; when even free land misses the target the answer is 0 and is marked `atBound:
'low'`; when the top of the bracket still beats the target the answer is the bound marked
`atBound: 'high'`. Rejected: extending the bracket until the target is met, which can run away on
deals whose yield on cost never reaches the target.

## 2026-11-04 — The CLI's M3 package is a plain HTML renderer that M4 replaces

`apps/cli/src/html.ts` writes the package as dependency-free HTML from the engine outputs using
the shared formatting module. Milestone M4 switches the CLI to the React package pages; the plain
renderer stays as a fallback. Rejected: starting the React pages in M3, which the spec allows but
would have delayed the CLI acceptance criteria.

## 2026-11-04 — PDF page numbers come from Chromium's footer template

Flowing pages (the assumptions register, an elaborated capital budget) paginate at print time, so
a page number written into the HTML cannot be right for every printed page. The PDF renderer
prints the deal, version, rounding footnote and "Page X of Y" in Chromium's footer template and
the in-page footer is hidden under print media; on screen each section shows its own number.
Rejected: fixed-height register pages with manual pagination, which would break on long notes.

## 2026-11-04 — Fonts: Inter from the system, embedded by Chromium

The package uses Inter (installed in the render image) with Helvetica/Arial fallbacks; Chromium
embeds the glyphs it uses in the PDF. Rejected: base64 web fonts in the HTML, which add ~400 KB
per package for no visual gain in the PDF.

## 2026-11-04 — Snapshot tests render the fixture HTML in a separate process

The Playwright test runner rewrites JSX in its own process for component testing, which breaks
`react-dom/server`. The snapshot spec therefore renders the fixture package with `tsx` in a child
process and loads the resulting HTML. Rejected: moving the snapshot tests to Vitest with a manual
pixel comparison, which loses Playwright's threshold-based image diffing.

## 2026-11-04 — Schema defaults carry source `unknown`, not `benchmark`

Spec 5 step 2 pre-fills the twelve inputs "from the benchmark … with source benchmark". The seed
template ships empty (9.2: Mark provides the values), so a new deal is defaulted from the schema
(14.2). Those values are not benchmarks, so they carry source `unknown` with the note "Schema
default; no benchmark seeded for this segment"; once a seed row exists the default is its `mid`
with source `benchmark` and the benchmark id. Rejected: labeling schema defaults `benchmark`,
which would make the register claim a provenance the number does not have.

## 2026-11-04 — Town table with approximate FY2025 rates, marked for verification

`@pencil/parcels` bundles 46 Massachusetts towns with a proposed cluster (commuter-rail zone and
rent level, for Mark to correct per 14.2) and residential tax rates recalled as approximate
FY2025 figures. Every row's `notes` says "rate approximate; verify with the assessor" and the
assessor URL is listed; the rate only seeds the stabilized-tax default, whose note repeats the
caveat. Rejected: shipping no rates, which would leave the twelve-input flow without a tax
default for every town.

## 2026-11-04 — The operating deficit reserve switch maps to `capitalizeOperatingDeficits`

6.3 lists an "Operating deficit reserve" switch with "months of reserve or explicit amount"
inputs; the engine (7.4, 7.7) has no upfront reserve line, only the choice between capitalizing
lease-up deficits into the budget (funded in order) or funding them from equity as they occur. The
switch controls that flag. A sized reserve is noted in `docs/later.md`. Rejected: adding a reserve
line to the engine now, which changes the money math beyond section 7.

## 2026-11-04 — Development sign-in provider outside production

Auth.js is configured for email magic links (Nodemailer) and Google when their environment
variables are present. Outside production, or with `PENCIL_DEV_AUTH=1`, a credentials provider
signs in any email without a password so local development and the end-to-end tests need no mail
server. Sessions are JWTs so the three providers share one strategy. Rejected: a mail-catcher
service in the test harness.

## 2026-11-04 — Browser-safe entry points for shared packages

`@pencil/db/state` exposes the pure deal-state functions (used optimistically in the browser)
without the database client, and `@pencil/package-pages/render` isolates `react-dom/server`,
which Next.js pages may not import. Rejected: duplicating the state logic in the web app.

## 2026-11-04 — Organization membership model in V1

Every user gets a personal organization on first sign-in and is its owner; the first membership
is the current organization. Inviting members is an owner action on the settings screen in a
later milestone. Rejected: an organization picker in V1, which the spec's single-owner model does
not need.

## 2026-11-04 — A two-cycle in the TPC fixed point is resolved, not thrown

Spec 7.6 iterates TPC → (Lc, M, E) → schedule → TPC until |ΔTPC| < $1 and throws after 50
iterations. The month of the first mezzanine draw is a discrete function of the equity
commitment: when E lands within a few hundred dollars of a month boundary, the fee and one month
of interest move, the map jumps by that amount, and the iteration alternates between two schedules
forever (the property tests found a deal that cycled between TPCs $668 apart on $39.9M). The
solver now detects a two-cycle (a pass reproduces the TPC fed into the previous pass), accepts
the pass with the smaller residual, reports `diagnostics.residual` and `convergence:
'oscillation'`, and raises the flag `fixed-point-oscillation`; invariant 3 tolerates that residual.
Genuine divergence still throws `non-convergent`. Rejected: throwing, which would fail legitimate
deals over an immaterial amount; and charging the mezzanine fee at a fixed month, which would
contradict 7.6's "fee at first draw" in the common case.

## 2026-11-04 — Results run in the browser; sensitivities run on the server

The Results screen computes the three scenarios in the browser on every change (spec 5 step 3,
11.4: "in the browser for instant results") with the same engine package the server uses for
Versions. Sensitivity grids run on the server through a server action because they are saved
with the deal and can be 81 engine runs; the client resyncs its state afterwards. Rejected:
running grids in the browser and posting the result, which would let a client write numbers the
server did not compute.

## 2026-11-04 — Quick inputs on the Results screen

The twelve tonight inputs are editable beside the results so a "what if the land is $1M more"
answer takes seconds (job story 4). They write through the same patches as the Inputs screen
(value only; source and note stay on the Inputs screen). Rejected: results as a read-only view,
which forces a round trip to the Inputs tab for every what-if.

## 2026-11-04 — Compare renders three package columns

"Side by side" for pages other than Returns is three package-width columns in a horizontally
scrolling row, each rendered by the same page component as the PDF. Rejected: a merged
three-column table per page, which would be a second implementation of every page.

## 2026-11-04 — The PDF renders the package route, in-process when no render service is set

Spec 11.2 renders the package route in a Playwright container called with a Version id and a
signed token. The web app exposes `/packages/<versionId>?t=<signed token>` (10-minute HMAC token,
no session) and asks the render service for it when `PENCIL_RENDER_URL` is configured; without a
service (local development, tests) it drives Chromium in its own process through `@pencil/render`.
Rejected: rendering HTML with `react-dom/server` inside the web app, which Next.js forbids in
server components and which would make the PDF diverge from the on-screen package route.

## 2026-11-04 — Files are generated on demand for a Version and reused

An export creates the Version and its file; a share link offers both files, and a file that was
not generated yet is produced on first download from the frozen Version and stored. Rejected:
generating both files at every export, which doubles the export time for readers who want one.

## 2026-11-04 — Entitlements default to Pro outside production

`hasEntitlement` implements FR-10.2 (Free: screen only; Per-deal: one deal for 12 months; Pro:
everything). Outside production `PENCIL_DEFAULT_TIER` defaults to `pro` so local work and the
end-to-end suite are not blocked; M10 adds Stripe and the Free-tier upgrade prompt test with the
default forced to `free`. Rejected: no gating until M10, which would leave the code path untested.

## 2026-11-04 — Letterhead image stored inline in organization settings

A small PNG/SVG (≤ 300 KB) is kept as a data URL in `organizations.settings.letterheadImage` and
embedded in every page; `letterhead_key` stays for a future object-storage upload. Rejected: an
upload pipeline through object storage for a single small image.

## 2026-11-04 — Contributed ranges carry a null contributor and a `contrib:` id

9.1 says `contributorOrgId` is null for seed data and set for contributed ranges. A nightly range
aggregates five or more deals from three or more organizations, so no single organization owns it;
the row keeps `contributorOrgId` null, an id prefixed `contrib:`, a `source` naming the counts and
`sampleSize`. Individual contributions keep their organization in the `contributions` table.
Rejected: storing one organization's id on an aggregate, which would misattribute the range.

## 2026-11-04 — Extra benchmark seeds through `PENCIL_SEED_BENCHMARKS`

The shipped seed template is empty until Mark fills it, so local demos and the end-to-end tests
load a second CSV of filled rows from `PENCIL_SEED_BENCHMARKS` (ids prefixed `extra-`). Rejected:
committing invented Massachusetts ranges into the real seed, which the register would then cite
as benchmarks.
