# Progress

Milestone status per `docs/SPEC.md` section 13. Each entry names what was built, what was
verified, how it was verified, and what is left.

| Milestone | Status |
| --- | --- |
| M0 Scaffold | done (2026-11-04) |
| M1 Engine core | done (2026-11-04) |
| M2 Engine operations and capital | done (2026-11-04) |
| M3 Engine analysis and CLI | not started |
| M4 Package pages and exports | not started |
| M5 Web app: deals and inputs | not started |
| M6 Web app: results, scenarios, sensitivities | not started |
| M7 Web app: package, versions, sharing | not started |
| M8 Benchmarks and parcels | not started |
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

## Blockers and gaps

- **Reference workbooks missing.** `reference/` is empty because the five workbooks listed in
  section 12.3 were not supplied with the specification. Golden tests (12.3) cannot run against
  cached workbook values until they are added. See `reference/README.md`.
