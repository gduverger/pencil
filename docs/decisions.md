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
