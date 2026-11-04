# Pencil — Product Requirements & Technical Spec (v1)

Nov 3, 2026 · @Georges Duverger

## 1. How to use this document

This is the complete brief for building Pencil, written to be handed to Claude Code as the opening prompt and kept in the repo as `docs/SPEC.md`. Sections 7 (engine) and 12 (testing) are binding; every other section is a requirement where judgment is allowed within the stated scope.

**Working agreement for the implementing agent**

1. Read the whole document before writing code. Then work in the milestone order of section 13; do not start a milestone until the previous one's acceptance criteria pass.
2. The calculation engine is a pure, deterministic TypeScript library with no I/O, no dates from the clock, and no dependencies beyond the standard library. Nothing anywhere else in the system computes a financial number.
3. Tests come first for the engine: every formula in section 7 gets a unit test, and the invariants in section 12 run on every build. Do not mark a milestone done with a failing or skipped test.
4. When the spec is ambiguous, choose the simplest behavior consistent with the principles in section 2, record the decision in `docs/decisions.md` (one dated entry per decision, with the alternative you rejected), and continue. Stop and ask only when the ambiguity changes the data model or the money math.
5. Do not add features outside section 3. Write ideas to `docs/later.md` instead.
6. Keep `docs/progress.md` current: milestone, status, what was verified and how. Commit at least once per milestone with a message that names the milestone.
7. Verify what you claim: run the test suite, render the generated PDF to PNG and look at every page, open the Excel export and check that totals are formulas. A claim without a check is a bug.
8. Display rounding (section 7.13) happens only in the presentation layer. The engine always returns full-precision numbers.

**Vocabulary used throughout**

| Term | Meaning |
| --- | --- |
| Deal | One site, one program, one set of dated assumptions, and everything computed from them |
| Input | A single assumption with a value, unit, source, note, timestamp and history |
| Switch | An optional component of a deal that is on or off; off is ignored in the math but its configuration is kept |
| Event | A labeled one-off cost or inflow placed at a specific month |
| Scenario | A named set of overrides on the base inputs: Likely (base), Best, Worst |
| Version | An immutable snapshot of inputs and outputs, created on share or export |
| Package | The exported set of output pages (PDF) plus the Excel workbook |
| Benchmark | A dated, sourced range for an input, keyed to a Massachusetts segment |
| Engine | The pure library `@pencil/engine` that turns inputs into schedules and metrics |

## 2. Mission and context

Pencil is a web app that takes a Massachusetts multifamily site and about a dozen assumptions and produces a bank-and-partner-ready feasibility package: every number comes from a tested calculation engine, every assumption carries a source, a date and a benchmark check, and the answer is always a range (best / likely / worst), never a single number.

**Why it exists.** Developers answer one question before anything else: should I do this deal, and what will it make? Today that answer lives in a fragile Excel model that takes an expert two months to build from scratch, breaks when a component is added or removed, takes hours to format for a client, and presents dollars-and-cents precision on numbers nobody knows to within 10%. Off-the-shelf templates are free but unaudited; the only institutional tool (ARGUS) is built for office buildings and costs more than a part-time analyst. Small sponsors, newly numerous in Massachusetts because of by-right MBTA Communities zoning, can read a pro forma but cannot build one and will not pay for an analyst.

**Grounding.** The product is derived from a stakeholder interview with Mark, a 22-year multifamily developer and advisor in the Boston area, plus five reference Excel models in `reference/`. These principles from that interview are binding; when in doubt, decide in their favor:

1. The model follows the life of the project: site, program, cost, operations, sale, distribution. Every calculation runs on a monthly timeline because returns are time-value-of-money from day one.
2. Nothing starts from scratch. A new deal starts from a clone, a template, or a dozen benchmark-defaulted inputs.
3. Components turn on and off without breaking anything, and off never means deleted.
4. Start simple, elaborate later: a line that is one number tonight can be a sum of twenty quoted line items next month without the outputs changing shape.
5. One-off items (a historic house that must be relocated and later sold) are first-class, labeled events, never a hack on another number.
6. Every input carries why it was chosen, from where, and when; old values are never overwritten, only superseded.
7. Never present a single number as truth: best, likely and worst are always available, and sensitivities are computed on demand, not continuously.
8. Back of house (inputs, monthly detail, notes) and front of house (the package the client sees) are different views of the same data.
9. Precision is a lie: dollars round to the nearest thousand everywhere except per-square-foot figures.
10. Excel is the industry's lingua franca: the package always includes an Excel export, and the UI for inputs should feel familiar to a spreadsheet user.
11. No real-time co-editing. One owner per deal; versions and sharing instead.

**Not in this document.** Market analysis, pricing rationale and competitor teardown live elsewhere. This document only says what to build and how.

## 3. Scope

V1 is a single-market (Massachusetts), single-asset-type (ground-up rental multifamily, 20 to 300 units) feasibility tool with a package export. Everything below is in or out; anything not listed is out.

**In V1**

| Area | Included |
| --- | --- |
| Deal setup | Start from address, clone, or template; the twelve-input "tonight" set with benchmark defaults |
| Inputs | Value, unit, source, note, timestamp, append-only history, benchmark range and out-of-range flag on every input |
| Elaboration | Any summary line expands into child line items that sum to it; events for one-off costs and inflows |
| Switches | Ground-floor commercial space (simple), land loan, construction-loan interest-only, permanent refinance, mezzanine tranche, operating deficit reserve |
| Engine | Monthly timeline, cost curves, equity-first funding, construction interest, lease-up, operations, DSCR/LTV-sized permanent loan, sale, tiered waterfall, metrics, residual land value |
| Scenarios | Likely (base), Best, Worst as override sets; side-by-side on every output |
| Sensitivities | Two-input grids on any metric, computed on demand; three saved presets |
| Package | Nine-page PDF with letterhead; Excel workbook with assumptions and schedules; read-only share link; immutable versions |
| Benchmarks | Massachusetts benchmark table seeded from Mark's data; defaults and flags; opt-in anonymized contribution |
| AI | Guided intake interview, explain-this-number, reviewer flags, narrative draft for the summary page |
| Accounts and billing | Email auth, organizations, Free / Per-deal / Pro tiers via Stripe Checkout |

**Out of V1 (do not build, do not leave stubs in the UI)**

- Condo or for-sale analysis of any kind
- Full mixed-use: multi-tenant retail or office with lease-by-lease modeling
- Office, industrial, hotel, self-storage, land subdivision
- Markets outside Massachusetts (the engine is generic; benchmarks and parcel lookup are not)
- Operations accounting, property management, portfolio views
- Real-time collaborative editing
- Importing an existing Excel model (unit mix CSV import is in)
- Localization: USD and square feet only
- Tax-credit, affordable-housing subsidy layers beyond a simple per-unit affordable rent override
- Native mobile apps (the web app must be usable on a phone for reading a shared package)

**Non-goals that shape design**

- Pencil is not a general modeling platform. Flexibility comes from elaboration, switches and events, not from user-written formulas.
- Pencil does not replace an analyst's diligence. It makes assumptions explicit and checkable; it does not source them.

## 4. Users and jobs

Three people touch a deal; only the first two log in.

| Persona | Who they are | Job to be done | What they must be able to do |
| --- | --- | --- | --- |
| Sponsor (primary buyer) | A one-to-five-person development shop evaluating a 20–300-unit project, often on a parcel newly zoned by-right. Can read a pro forma; cannot build one; will not hire an analyst. | "Does this site pencil, and can I show my bank and my partner something credible by Friday?" | Start from an address, answer the twelve inputs with help, see a range, export the package, share a link |
| Advisor / expert (power user) | A developer or consultant who runs deals for clients or partners and already builds models in Excel. Mark is the reference user. | "Get the back-of-house work out of my way so I spend my time on diligence and the client, not on formulas and formatting." | Clone and template deals, elaborate any line, add events, flip switches, run sensitivities, re-export in minutes, defend every number two weeks later |
| Reader (never logs in) | A community-bank lender, an LP or family office, a town board. | "Is this believable, and what did they assume?" | Open a share link on any device, read the package, download the PDF and the Excel, see the assumptions register |

**Job stories the UI must serve**

1. When I have a parcel address and an hour, I want a defensible range of returns, so I can decide whether to spend money on an architect.
2. When my hard-cost number is a guess, I want to see where it sits against recent Massachusetts projects of the same construction type, so I know how much to trust it.
3. When a client asks why we used that rent, I want the number's source, note and date in one click, so I am not reconstructing a decision from memory.
4. When the client asks "what if we went modular" or "what if the land is $1M more", I want the answer in seconds without breaking the model.
5. When I hand the package to a bank, I want it to look like it came from a firm, carry my letterhead, and include an Excel file they can open.
6. When I come back in two years to sell, I want the exact assumptions we presented, frozen as of that date.

**Explicitly not users in V1:** institutional acquisition teams, brokers producing marketing decks, lenders underwriting loan books, anyone modeling condos or office.

## 5. Product walkthrough

A sponsor goes from a street address to a shared package in nine steps; an advisor can skip to any step. The app has four screens per deal — Setup, Inputs, Results, Package — plus a deal list and settings.

1. **Start.** From the deal list: *New from address*, *Clone*, or *From template*. New-from-address geocodes the address, looks up the parcel (lot area, zoning district, MBTA Communities district flag, assessed value, current annual tax) from the Massachusetts parcel and assessor data loaded in `@pencil/parcels`, and shows a back-of-envelope buildable envelope from the district's density rule. Every looked-up value is an input with source `parcel-data` and the lookup date; if the lookup fails, the fields are left empty with source `unknown` and the deal still proceeds.
2. **The twelve inputs.** The Inputs screen opens in *Tonight* mode: the twelve inputs of section 7.2, each pre-filled from the benchmark for the parcel's town cluster (section 9) with source `benchmark`. The user overrides any value; the override gets source `my-number`, `quote` or `comp`, an optional note, and the timestamp. The benchmark range sits beside the field; a value outside it shows a flag with the range.
3. **Pencil it.** The Results screen shows the Returns page for the Likely scenario in under a second, with Best and Worst columns beside it. Results re-run on every input change (the engine is fast enough); sensitivities do not.
4. **Elaborate.** On the Inputs screen the user expands any summary line (hard cost, soft cost, any operating expense) into child lines. Children must sum to the parent; adding a child with a value adjusts an auto-balancing *remainder* child until the user deletes it. Each child is itself an input with full metadata. Collapsing a parent keeps the children; the parent shows the sum.
5. **Events.** The user adds a one-off cost or inflow: label, month, amount, category (land, hard, soft, other, inflow). Events appear as their own line on the capital budget, sources and uses, and cash flow pages.
6. **Switches.** A panel lists the optional components (section 6.3). Turning one on reveals its inputs with benchmark defaults; turning it off hides them and removes them from the math; the values are retained for re-enabling.
7. **Scenarios.** A scenario selector offers Likely, Best, Worst. In Best or Worst, edited fields are overrides (visually marked); unedited fields follow Likely. A *Compare* toggle on every output page shows the three side by side.
8. **Sensitivities.** The user picks two inputs and value lists (or a preset: exit cap × rent growth, hard cost × construction rate, vacancy × exit cap) and one or more metrics, then presses *Run*. Grids render as heat-shaded tables and are saved with the deal until inputs change, when they are marked stale.
9. **Package.** The Package screen lists the nine pages (section 8) with toggles, a letterhead picker and a cover note. *Export PDF* and *Export Excel* create a Version (immutable snapshot of inputs, outputs and package settings) and the files. *Share* creates a read-only link to a Version with an optional expiry; readers see the package pages in the browser and can download both files. Re-exporting after a change creates a new Version; old links keep showing their own Version.

**Clone and templates.** Clone copies inputs, elaboration, events, switches and scenarios into a new deal with history reset to a single entry per input ("cloned from \<deal>"). A template is a deal marked as such by an organization admin; new-from-template behaves like clone.

**Advisor shortcuts.** Keyboard navigation through inputs, paste of a column of numbers into a child-line list, CSV import of a unit mix, and a *Diff versions* view that lists every input that changed between two Versions with old and new values and notes.

## 6. Functional requirements

Each requirement has an id (FR-x.y) so tests and commits can reference it.

**6.1 Inputs and metadata**

- FR-1.1 Every input stores: `value` (number or string), `unit` (one of `usd`, `usd_per_sf`, `usd_per_unit`, `usd_per_unit_month`, `pct`, `sf`, `units`, `months`, `rate_pct`, `count`, `text`), `source` (one of `benchmark`, `parcel-data`, `my-number`, `quote`, `comp`, `calculated`, `unknown`), `note` (free text), `updatedAt`, `updatedBy`.
- FR-1.2 Every change to `value`, `source` or `note` appends the previous state to `history` with its timestamp and author. History is never edited or deleted by the application.
- FR-1.3 Inputs are addressed by a stable dotted path (for example `costs.hard.perGrossSF`, `program.unitTypes[1BR].rent`); the engine, scenarios, sensitivities, flags and the assumptions register all use the same paths.
- FR-1.4 Unit formatting is automatic from `unit`; the user types bare numbers.
- FR-1.5 A benchmark range (low, mid, high, as-of, source) is shown beside any input that has one; a value outside \[low, high\] shows a flag stating the range.

**6.2 Elaboration**

- FR-2.1 Any input marked `elaborable` in the schema can hold child inputs. When children exist, the parent's value is their sum and is read-only.
- FR-2.2 Adding the first child creates a `remainder` child equal to parent minus the new child so totals do not jump; the user may rename, edit or delete it.
- FR-2.3 Children carry full metadata (FR-1.1, FR-1.2) and may carry a `distribution` override (section 7.4).
- FR-2.4 Collapsing keeps children; deleting all children returns the parent to an editable value.

**6.3 Switches**

| Switch | Default | Inputs it reveals |
| --- | --- | --- |
| Commercial space | off | gross SF, rent $/SF/yr, vacancy %, TI $/SF, lease-up months, opex $/SF |
| Land loan | off | LTV on land, rate, term months, fee % |
| Construction loan interest-only | on | always on in V1 (shown, not switchable) |
| Permanent refinance | on | refi month offset, max LTV, min DSCR, rate, amortization years, IO months, fee %, refi cap rate |
| Mezzanine tranche | off | amount or % of cost, rate, fee %, repaid at refi or sale |
| Operating deficit reserve | on | months of reserve or explicit amount |
| Affordable units | off | % of units affordable, rent discount % |

- FR-3.1 Off means excluded from every calculation and every output page; on means included everywhere.
- FR-3.2 Switch state and the hidden values persist with the deal and are cloned.

**6.4 Events**

- FR-4.1 An event has `label`, `month`, `amount`, `kind` (`cost` or `inflow`), `category` (`land`, `hard`, `soft`, `other`, `inflow`), `note`, metadata as FR-1.1.
- FR-4.2 Cost events are capitalized into total project cost and funded in the normal order; inflow events reduce required funding in that month and appear as a source in Sources & Uses.

**6.5 Scenarios**

- FR-5.1 Three fixed scenarios: `likely` (base), `best`, `worst`. Best and Worst are maps of path to override value; unlisted paths inherit Likely.
- FR-5.2 Any output page can show one scenario or all three side by side. The returns page defaults to all three.
- FR-5.3 Overridden fields are visually distinct and list the Likely value on hover.

**6.6 Sensitivities**

- FR-6.1 A sensitivity is: scenario, axis A (path, list of values), axis B (path, list of values), metrics (list). Each cell is a full engine run with the two overrides applied on top of the scenario.
- FR-6.2 Sensitivities run only on explicit request and are stored with the deal; they are marked stale when any input in the scenario changes.
- FR-6.3 Three presets ship: exit cap (4.5–6.5% by 0.25) × rent growth (0–4% by 1), hard cost $/SF (±20% by 5%) × construction rate (±200 bp by 50), stabilized vacancy (3–10%) × exit cap.

**6.7 Package, versions, sharing**

- FR-7.1 Exporting PDF or Excel creates a Version: a frozen copy of inputs (with metadata), switch state, events, scenarios, engine outputs, sensitivities and package settings, plus `engineVersion`.
- FR-7.2 A share link references one Version and is read-only; it may expire; it can be revoked. Readers need no account.
- FR-7.3 The PDF (section 8) renders from the same React components as the on-screen package pages.
- FR-7.4 The Excel export (section 8.11) is generated server-side from the Version, never from live state.
- FR-7.5 *Diff versions* lists changed inputs (path, old, new, note, who, when) and changed headline metrics.

**6.8 Benchmarks** — see section 9.

**6.9 Guided intake and explanations** — see section 10.

**6.10 Accounts and billing**

- FR-10.1 Email-link or OAuth sign-in; an organization owns deals; roles `owner`, `member`.
- FR-10.2 Tiers: Free (unlimited deals, on-screen results, no export or share), Per-deal ($199 one-time per deal: unlimited exports and shares of that deal for 12 months), Pro ($2,400/year per organization: everything, letterhead, templates, benchmark detail). Checkout via Stripe Checkout; entitlement is checked at export and share time.
- FR-10.3 A `reviewed` flag on a Version can be set only by a reviewer role; it adds a "Reviewed by \<firm>" line to the package cover. Fulfillment of the review itself is manual and out of scope.

**6.11 Settings**

- FR-11.1 Organization settings: name, letterhead image, default waterfall structure, default hold period, rounding preferences (section 7.13), default scenario deltas for Best/Worst (for example rents ±5%, hard cost ∓10%).

## 7. Calculation engine specification

The engine is `@pencil/engine`: a pure function from `DealInputs` to `DealOutputs` on a monthly timeline, with no I/O, no randomness and no clock. This section is binding. Where a formula is stated, implement it exactly; where a default is stated, it is the schema default, not a hard-coded constant.

**7.1 Conventions**

- Time is an integer month index `t`, with `t = 0` the analysis month. All money is in nominal dollars as of month `t`. Rates given as annual percentages are converted to monthly as `r / 12` (nominal), except where a formula states compounding.
- Phases: predevelopment `[0, P)`, construction `[P, O)` where `O = P + C`, lease-up `[O, Z)` where `Z = O + L`, stabilized `[Z, S]`, sale at `S = holdMonths`. Operations are projected through `S + 12` because valuation uses forward NOI. Validation rejects `S < Z`.
- Growth is an annual step: `g(r, t) = (1 + r) ^ floor(t / 12)`, applied from month 0 to rents, other income, commercial rent, and every operating expense line (taxes included, from month `O`).
- Numbers are IEEE doubles; the engine never rounds. Tests compare with a tolerance of $1 on money and 1e-6 on rates.

**7.2 Input schema** (TypeScript; the twelve "tonight" inputs are marked ★; everything else has a benchmark or schema default)

```ts
export interface DealInputs {
  meta: { name: string; analysisMonth: string; holdMonths: number /* ★ S, default 120 */ };
  site: {
    lotSF: number; zoningDistrict?: string; mbtaCommunitiesDistrict?: boolean;
    landCost: number;            // ★ purchase price; if landOwned, the ascribed value
    landOwned: boolean;          // owned land is contributed in kind by the GP at t=0
    closingCostPct: number;      // default 0.02 of landCost
  };
  program: {
    totalUnits: number;          // ★
    unitTypes: Array<{ key: 'studio'|'1BR'|'2BR'|'3BR'; mixPct: number; avgSF: number; rentPerMonth: number }>; // ★ mix, ★ sizes, ★ rents
    efficiency: number;          // net rentable / gross, default 0.85
    otherIncomePerUnitMonth: number; // parking, fees, default from benchmark
    affordable: { enabled: boolean; pctUnits: number; rentDiscountPct: number };
    commercial: { enabled: boolean; grossSF: number; rentPerSFYear: number; vacancyPct: number; tiPerSF: number; leaseUpMonths: number; opexPerSFYear: number };
  };
  timeline: { predevMonths: number; constructionMonths: number; leaseUpMonths: number }; // ★ all three
  costs: {
    hard: { perGrossSF: number /* ★ */; contingencyPct: number /* default 0.05 */; distribution: Distribution /* default scurve */ };
    soft: { pctOfHard: number /* ★ */; contingencyPct: number /* default 0.05 */; predevShare: number /* default 0.6 */ };
    carry: { taxesDuringConstructionAnnual: number; insuranceDuringConstructionAnnual: number };
    developerFeePct: number;     // of hard + soft, default 0; straight-line over [0, O)
  };
  events: Array<{ id: string; label: string; month: number; amount: number; kind: 'cost'|'inflow'; category: 'land'|'hard'|'soft'|'other'|'inflow' }>;
  financing: {
    constructionLoan: { ltc: number /* ★ */; ratePct: number /* ★ */; feePct: number /* default 0.01 */ };
    landLoan: { enabled: boolean; ltv: number; ratePct: number; feePct: number };
    mezz: { enabled: boolean; pctOfCost: number; ratePct: number; feePct: number; repaidAt: 'refi'|'sale' };
    permanent: { enabled: boolean; monthsAfterStabilization: number /* default 0 */; maxLTV: number; minDSCR: number; ratePct: number /* ★ */; amortYears: number /* ★ */; ioMonths: number; feePct: number; refiCapRatePct: number };
    capitalizeOperatingDeficits: boolean; // default true: lease-up deficits are project costs funded in order
  };
  operations: {
    stabilizedVacancyPct: number; creditLossPct: number;      // defaults 0.05, 0.005
    rentGrowthPct: number; expenseGrowthPct: number; otherIncomeGrowthPct: number;
    absorption: { kind: 'linear' } | { kind: 'unitsPerMonth'; units: number };
    opex: { taxesStabilizedAnnual: number /* ★ */; insurancePerUnit: number; repairsPerUnit: number; payrollPerUnit: number; utilitiesPerUnit: number; adminPerUnit: number; marketingPerUnit: number; reservesPerUnit: number; managementPctEGI: number }; // ★ opex per unit as a group
  };
  exit: { exitCapRatePct: number /* ★ */; brokerFeePct: number /* default 0.02 */; closingCostPct: number /* default 0.01 */ };
  equity: { gpPct: number; lpPct: number; tiers: Array<{ hurdleIrrPct: number | null; lpSplit: number; gpSplit: number }> }; // ★ structure; last tier hurdle null
}
export type Distribution = { kind: 'scurve' } | { kind: 'straight' } | { kind: 'custom'; weights: number[] };
```

Any input marked `elaborable` in the JSON schema (hard cost, soft cost, each opex line, carry) may be replaced by a list of children `{ label, amount, distribution? }`; the engine receives the resolved totals and the per-child distributions, never the UI structure.

**7.3 Program and revenue basis**

- Units per type: `units_i = round(totalUnits × mixPct_i)` with largest-remainder correction so the sum equals `totalUnits`.
- `NRSF = Σ units_i × avgSF_i`; residential `GSF = NRSF / efficiency`; `GSF_total = GSF + commercial.grossSF` when commercial is on.
- Monthly gross potential rent: `GPR(t) = Σ units_i × rent_i × g(rentGrowth, t)`, with the affordable share of each type's units (if on) at `rent_i × (1 − rentDiscountPct)`.
- Other income: `OI(t) = totalUnits × otherIncomePerUnitMonth × g(otherIncomeGrowth, t)`.

**7.4 Capitalized costs and their distribution over time**

| Line | Amount | Timing |
| --- | --- | --- |
| Land | `landCost` (owned: in-kind GP contribution of the same amount) | month 0 |
| Closing | `landCost × closingCostPct` | month 0 |
| Hard | `H = perGrossSF × GSF_total` | S-curve over `[P, O)` by default |
| Hard contingency | `H × contingencyPct` | same curve as hard |
| Soft | `SC = H × pctOfHard` | `predevShare` straight-line over `[0, P)`, remainder straight-line over `[P, O)` |
| Soft contingency | `SC × contingencyPct` | same as soft |
| Carry taxes | `taxesDuringConstructionAnnual / 12` per month | each month in `[0, O)` |
| Carry insurance | `insuranceDuringConstructionAnnual / 12` per month | each month in `[P, O)` |
| Developer fee | `(H + SC) × developerFeePct` | straight-line over `[0, O)` |
| Commercial TI | `grossSF × tiPerSF` | month `O` |
| Events (cost) | `amount` | `month` |
| Loan fees | section 7.6 | at the relevant closing month |
| Capitalized interest | section 7.6 | monthly |
| Operating deficits | section 7.7, when `capitalizeOperatingDeficits` | monthly during `[O, R)` |

S-curve weights over a window of `C` months:

```latex
w_k = \frac{\phi\!\left(\frac{k + 0.5 - C/2}{C/6}\right)}{\sum_{j=0}^{C-1}\phi\!\left(\frac{j + 0.5 - C/2}{C/6}\right)},\qquad \phi(z)=\frac{1}{\sqrt{2\pi}}e^{-z^{2}/2},\qquad k = 0,\dots,C-1
```

Straight-line is `w_k = 1 / C`; custom weights are normalized to sum to 1 and must have length `C`. Total project cost `TPC` is the sum of every line in the table. Inflow events are not costs; they are sources (7.6).

**7.5 Events**

A cost event is added to month `month` under its category and is funded in order. An inflow event reduces the funding requirement of its month before equity is called; if it exceeds that month's costs, the excess reduces the next months' requirement (it is never distributed before stabilization). Both appear as their own labeled lines in the capital budget and sources & uses.

**7.6 Funding order, construction interest and the fixed point**

For each month `t`, the net requirement is `need_t = costs_t − inflows_t` (carry-forward of surplus inflow applied). It is funded in this order: equity until the equity commitment `E` is exhausted; then mezzanine (if on) until its commitment `M` is exhausted; then the construction loan. Owned land is an equity contribution at month 0 that also counts toward `E`.

- Construction loan: `B_t = B_{t−1} + D_t + I_t`, `I_t = B_{t−1} × r_c / 12`. Interest is capitalized (added to the balance) and is a project cost. Commitment `Lc = ltc × TPC`. Fee `Lc × feePct` is a cost at month `P`.
- Land loan (if on): `ltv × landCost` drawn at month 0, interest capitalized at its rate, fee at month 0; its balance is rolled into the construction loan at month `P` (treated as a draw at `P`).
- Mezzanine (if on): `M = pctOfCost × TPC`, interest capitalized at its rate, fee at first draw, repaid at refinance or sale per `repaidAt`.
- Equity commitment: `E = TPC − Lc − M`.

`TPC` depends on capitalized interest, which depends on draws, which depend on `E` and `Lc`. Solve by fixed-point iteration: start with interest = 0, compute `TPC`, `Lc`, `E`, run the monthly schedule, recompute interest and `TPC`; repeat until `|ΔTPC| < 1` dollar, maximum 50 iterations, otherwise throw `EngineError('non-convergent')` with the last two iterations attached. The iteration count is reported in `outputs.diagnostics`.

**7.7 Lease-up and operations** (from month `O`)

- Occupancy: linear `occ(t) = occ_s × min(1, (t − O + 1) / L)` with `occ_s = 1 − stabilizedVacancyPct`; or units-per-month `occ(t) = min(occ_s, units × (t − O + 1) / totalUnits)`. For `t ≥ Z`, `occ(t) = occ_s`.
- `EGI(t) = GPR(t) × occ(t) × (1 − creditLossPct) + OI(t) × occ(t) + CommercialIncome(t)`, where commercial income is `grossSF × rentPerSFYear / 12 × g(rentGrowth, t) × occ_c(t) × (1 − vacancyPct)` with its own linear lease-up.
- Operating expenses from month `O`: each per-unit line is `perUnit × totalUnits / 12 × g(expenseGrowth, t)`; stabilized taxes are `taxesStabilizedAnnual / 12 × g(expenseGrowth, t)`; management is `managementPctEGI × EGI(t)`; commercial opex is `grossSF × opexPerSFYear / 12 × g(expenseGrowth, t)`. All lines are fixed with respect to occupancy in V1.
- `NOI(t) = EGI(t) − Opex(t)`.
- Before the refinance month `R`, a negative `NOI(t)` is an operating deficit: a project cost funded in order when `capitalizeOperatingDeficits` is true, otherwise an equity contribution pro rata. A positive `NOI(t)` before `R` reduces that month's funding requirement.

**7.8 Permanent loan (refinance)** at `R = Z + monthsAfterStabilization`, when enabled

- `NOI12 = Σ NOI(R .. R+11)`; `V_R = NOI12 / refiCapRatePct`.
- `L_LTV = maxLTV × V_R`. `L_DSCR` from the maximum annual debt service `NOI12 / minDSCR`:

```latex
L_{DSCR} = \frac{NOI_{12}}{DSCR_{min}\cdot 12}\cdot\frac{1-(1+i)^{-n}}{i},\qquad i=\frac{r_p}{12},\quad n = 12\cdot\text{amortYears}
```

- `L_perm = min(L_LTV, L_DSCR)`; fee `L_perm × feePct`.
- Payoff at `R`: construction balance `B_R` plus mezzanine if `repaidAt = 'refi'`. Net `L_perm − fee − payoff`: if positive it is a distribution to equity through the waterfall at month `R`; if negative it is an equity contribution pro rata at `R`.
- Debt service: for the first `ioMonths`, interest only `L × i`; then the level payment `L × i / (1 − (1+i)^{−n})` with standard principal/interest split and balance tracking. The schedule is a reusable function `amortize(principal, ratePct, amortYears, ioMonths)` exported from the engine.
- When permanent is disabled, the construction loan stays outstanding at its rate, interest-only, until sale.

**7.9 Sale** at month `S`

- `V_S = Σ NOI(S+1 .. S+12) / exitCapRatePct`; selling costs `(brokerFeePct + closingCostPct) × V_S`; payoff = outstanding loan balance at `S` plus mezzanine if `repaidAt = 'sale'`; `netToEquity = V_S − sellingCosts − payoff`, distributed through the waterfall at `S`. Validation rejects a negative `netToEquity` only with a flag, not an error.

**7.10 Waterfall** (IRR-hurdle balances)

Contributions are split `gpPct / lpPct` on every equity call (in-kind land counts as GP). Distributions occur at `R` (refi proceeds), monthly after `R` as `max(NOI(t) − DS(t), 0)` (a negative value is a pro rata contribution), and at `S`. Each distribution `D_t` is allocated tier by tier:

- For every partner `p` and tier `k` with hurdle `h_k`, keep a hurdle balance `HB[p][k]` updated monthly: `HB ← HB × (1 + h_k)^(1/12) + contributions_p,t − distributions_p,t` (all distributions to `p`, from any tier, reduce every balance).
- In tier `k`, pay at splits `(lpSplit_k, gpSplit_k)` until the LP's `HB[LP][k]` reaches zero; the tier's capacity in month `t` is `HB[LP][k] / lpSplit_k`. Remaining `D_t` flows to the next tier. The last tier (`hurdleIrrPct = null`) takes any residual at its splits.
- Default structure: tier 1 pro rata (lpSplit = lpPct) to an 8% hurdle; tier 2 70/30 to 15%; tier 3 50/50 residual. Organizations may change the default; tiers must have non-decreasing hurdles and splits that sum to 1.

**7.11 Metrics** (all on monthly series; annual IRR = `(1 + irr_m)^12 − 1`, solved by Newton with bisection fallback on `[−0.99, 10]`)

| Metric | Definition |
| --- | --- |
| Unlevered IRR | Series: `−(capitalized costs excluding loan fees and interest) + NOI(t) for t ≥ O` and at `S` `+ V_S − sellingCosts` |
| Project (levered) IRR | `−contributions_t + distributions_t`, all partners |
| LP IRR, GP IRR | Same series per partner |
| Equity multiple | `Σ distributions / Σ contributions`, total and per partner |
| Yield on cost | `Σ NOI(Z .. Z+11) / TPC` |
| Development spread | yield on cost − exit cap rate |
| DSCR by year | `NOI_year / DS_year` for calendar years with permanent debt |
| Cash-on-cash by year | `(NOI_year − DS_year) / cumulative contributions at year end` |
| Peak equity | `max_t (Σ contributions_{≤t} − Σ distributions_{≤t})` |
| Profit | `Σ distributions − Σ contributions` |
| Total project cost, cost per unit, cost per GSF | from `TPC` |

**7.12 Residual land value**

`residualLandValue(inputs, targetYieldOnCost)` returns the `landCost` at which yield on cost equals the target, found by bisection on `[0, 5 × landCost]` with the full engine run at each step (interest and loan size move with land), to within $100. Default target is `exitCapRatePct + 0.015`. Report per unit and per lot SF.

**7.13 Rounding (presentation layer only)**

`usd ≥ 100,000` → nearest $1,000; `usd < 100,000` → nearest $100; `usd_per_sf` → 2 decimals; `usd_per_unit` and `usd_per_unit_month` → nearest $1; percentages and rates → 2 decimals; IRR → 1 decimal; multiples → 2 decimals. Parts and totals are rounded independently and every table carries the footnote "Figures rounded; totals may not foot."

**7.14 Engine API**

```ts
run(inputs: DealInputs): DealOutputs
runScenario(inputs: DealInputs, overrides: Record<Path, unknown>): DealOutputs
sensitivity(inputs, scenario, axisA: {path, values}, axisB: {path, values}, metrics: MetricKey[]): Grid
residualLandValue(inputs, targetYieldOnCost?): { landCost, perUnit, perLotSF }
amortize(principal, ratePct, amortYears, ioMonths): AmortRow[]
validate(inputs): ValidationIssue[]   // errors block a run; warnings become flags
```

**7.15 Output schema** (abridged)

```ts
export interface DealOutputs {
  months: Array<{ t: number; phase: Phase; costs: Record<CostCategory, number>; inflows: number; equityIn: { gp: number; lp: number }; mezzDraw: number; loanDraw: number; interest: number; loanBalance: number; mezzBalance: number; gpr: number; occupancy: number; egi: number; opex: Record<OpexLine, number>; noi: number; debtService: { interest: number; principal: number }; permBalance: number; cashFlowAfterDebt: number; distributions: { gp: number; lp: number; byTier: number[] } }>;
  annual: Array<{ year: number; gpr; vacancy; egi; opex; noi; debtService; cashFlow; dscr; cashOnCash }>;
  totals: { tpc: number; byCategory: Record<CostCategory, number>; equity: number; constructionLoan: number; mezz: number; permanentLoan: number; capitalizedInterest: number; operatingDeficit: number };
  sourcesUses: { sources: Line[]; uses: Line[] };
  capitalBudget: Group[];
  sale: { noiForward: number; capRate: number; value: number; sellingCosts: number; payoff: number; netToEquity: number };
  waterfall: { tiers: TierResult[]; byPartner: Record<'gp'|'lp', { contributions: number; distributions: number; irr: number; multiple: number }> };
  metrics: Record<MetricKey, number | null>;
  flags: Array<{ path?: string; code: string; message: string }>;
  diagnostics: { iterations: number; engineVersion: string };
}
```

**7.16 Invariants** are listed in section 12 and run on every engine test; a violation is a test failure, not a warning.

## 8. Package specification

The package is nine pages rendered from the same React components on screen and in the PDF, plus an Excel workbook. Every page carries the organization letterhead, the deal name, the Version date, the scenario shown, page numbers, and the rounding footnote. Pages 1 to 9 are US Letter, portrait except where noted.

| # | Page | Content | Layout notes |
| --- | --- | --- | --- |
| 1 | Summary | Address, parcel facts, program (units, mix, GSF), hold period, headline range: project IRR, LP IRR, equity multiple, yield on cost, total project cost, per unit, per GSF; narrative paragraph (section 10) | One page; the three scenarios as columns |
| 2 | Returns | All section 7.11 metrics for likely / best / worst, by stakeholder (project, LP, GP); DSCR and cash-on-cash by year as a small table; a bar of peak equity vs total equity | The "is this a good deal" page |
| 3 | Sources & uses | Sources: GP equity (cash, in-kind land), LP equity, construction loan, mezzanine, inflow events, permanent loan at refi (shown as a memo line). Uses: land and closing, hard, hard contingency, soft, soft contingency, carry, developer fee, financing fees, capitalized interest, operating deficit, events. Totals must balance to the dollar before rounding | One page |
| 4 | Capital budget | Same uses grouped by category with children shown at the depth the deal was elaborated to; subtotal per group; per unit and per GSF columns | One to two pages |
| 5 | Annual cash flow | Year columns for the full hold: GPR, vacancy and credit loss, other income, commercial income, EGI, each opex line, NOI, debt service (interest, principal), cash flow after debt service, DSCR, cash-on-cash, distributions to LP and GP | Landscape; up to 12 years on one page |
| 6 | Sale analysis | Forward 12-month NOI, exit cap, gross value, selling costs, debt payoff, net to equity, then the waterfall by tier and by partner for the sale distribution | Six lines plus the waterfall table |
| 7 | Sensitivities | Each saved grid as a heat-shaded table with the likely case highlighted; stale grids are omitted with a note | One page per two grids |
| 8 | Assumptions register | Every input on the deal: path label, value with unit, source, note, date, benchmark range and flag; grouped by section; overrides per scenario listed under the base value | The defensibility page; may run long |
| 9 | Appendix | Permanent loan amortization by year; monthly schedule optional (off by default); methodology note with the engine version | Landscape |

**Charts.** Page 1 includes a single chart of annual NOI and debt service over the hold; page 3 includes a sources and uses pie. No other charts in V1.

**PDF generation.** Server-side with headless Chromium (Playwright) rendering the package route at Letter size; fonts embedded; file name `<deal>-<scenario>-<version date>.pdf`. Target: under 10 seconds for a nine-page package; the page must look correct at 100% in a desktop PDF viewer and when printed.

**8.11 Excel export**

One workbook, generated with a library that writes real formulas (exceljs or equivalent), with these sheets:

| Sheet | Content | Formulas |
| --- | --- | --- |
| Assumptions | Every input as a labeled row: label, value, unit, source, note, date | None |
| Annual | Page 5 as a table | Totals and NOI as `SUM` formulas over the rows above |
| Monthly | The `months` array, one column per month, one row per output field | Totals as `SUM` |
| Capital budget | Page 4 | Subtotals as `SUM` |
| Sources & uses | Page 3 | Totals as `SUM` |
| Amortization | The permanent loan schedule | Balance roll-forward as formulas |
| Returns | Page 2 metrics | None; values |

The workbook is a snapshot: changing an input cell does not recompute the model. A cover note on the Assumptions sheet says so and names the Version. Number formats follow section 7.13; column widths set; headers frozen.

## 9. Massachusetts benchmark layer

Benchmarks are what make a twelve-input deal credible: every default and every out-of-range flag comes from a dated, sourced range keyed to a Massachusetts segment. Mark seeds the table; the platform grows it.

**9.1 Schema** (`benchmarks` table)

| Column | Meaning |
| --- | --- |
| `metric` | The input path the benchmark applies to, e.g. `costs.hard.perGrossSF` |
| `segment` | JSON of keys that scope it: `townCluster` (one of `boston-core`, `inner-suburbs`, `outer-suburbs`, `gateway-cities`, `other-ma`), `constructionType` (`wood-frame`, `podium`, `steel-concrete`, `modular`), `unitType`, `projectSize` (`20-50`, `51-150`, `151-300`) — only the keys that apply |
| `low`, `mid`, `high` | The range; `mid` is the default value |
| `unit` | As in FR-1.1 |
| `asOf` | Date the range reflects |
| `source` | Free text: "Mark — 2025 bids, 4 projects", "town assessor FY2026" |
| `contributorOrgId` | Null for seed data; set for contributed ranges |
| `sampleSize` | Number of observations behind the range when known |

**9.2 Seed list** (Mark provides values; the agent provides the schema, loader and an empty CSV template with these rows)

- Hard cost $/GSF by construction type × town cluster
- Soft cost % of hard by project size
- Contingency % (hard, soft)
- Rents $/month and average SF by unit type × town cluster
- Other income $/unit/month
- Stabilized vacancy %, credit loss %
- Opex $/unit/year by line; management % of EGI
- Stabilized property tax: town residential tax rate per $1,000 (public, by town, FY2026) and a default assessment ratio to value
- Timeline months: predevelopment, construction by construction type × size, lease-up by size
- Construction loan LTC and rate spread; permanent loan LTV, DSCR, rate, amortization
- Exit and refi cap rates by town cluster
- Rent growth, expense growth
- Developer fee %, broker fee %, closing cost %

**9.3 Resolution.** When a deal is created, each input is defaulted from the most specific benchmark whose segment matches the deal (town cluster from the parcel's town; construction type from a setup question; size from total units), falling back to less specific segments, then to the schema default. The resolved benchmark id is stored on the input so the flag and the register can cite it.

**9.4 Flags.** An input outside `[low, high]` of its resolved benchmark produces a flag `{ path, code: 'outside-benchmark', message }` that appears beside the field, on the Returns page as a count, and in the assumptions register. Flags never block a run.

**9.5 Town data.** `@pencil/parcels` loads a Massachusetts town table (town, cluster, residential tax rate, assessor URL, MBTA Communities status) and, where a statewide parcel dataset is available, a parcel lookup by address returning lot SF, zoning district, assessed value and current tax. If the parcel dataset is not loadable in the environment, implement the town table and a stub lookup that returns `unknown` sources; do not block the product on it.

**9.6 Contribution (opt-in).** On export, an organization that has opted in contributes its deal's resolved values for the seed-list metrics, anonymized (no address, no name, no notes), tagged with segment keys and the export month. A nightly job recomputes contributed ranges as the 25th/50th/75th percentiles once a segment has at least five contributions from at least three organizations; seed ranges remain until then. Contributed ranges are shown with their sample size.

## 10. AI layer

The model configures, checks and explains; it never computes. Every number shown to a user comes from the engine, and every AI feature is a thin layer over engine inputs and outputs. Use the Anthropic API through one server-side module `@pencil/assistant` with a provider interface so the model can be swapped.

**10.1 Guided intake.** A conversational panel on the Setup and Inputs screens. The model holds the twelve-input list and the resolved benchmark for each, asks only for what the benchmarks cannot default (the address, the intended construction type, total units or target size, whether the land is owned, and any known numbers), explains each term in one plain sentence on request, and emits structured tool calls `setInput(path, value, source, note)` that the app applies with normal metadata. The user confirms each applied value in the panel; nothing is written silently. The transcript is stored with the deal.

**10.2 Explain this number.** Any output cell has an *Explain* action. The app sends the model the metric key, the engine's derivation trace for that cell (the engine exposes `explain(outputs, cellRef)` returning the operands and formula as data), and the relevant inputs with their metadata; the model returns two to four plain sentences. The trace, not the model, is the source of truth; the model may not introduce numbers absent from the trace.

**10.3 Reviewer flags.** Rule-based checks run in the engine's `validate` and in the benchmark layer (section 9.4). The model turns each flag into one plain sentence with the comparison stated ("Your 2BR rent of $3,400 is above the $2,700–$3,200 range for inner suburbs as of Q3 2026"). No flag is generated by the model itself.

**10.4 Narrative draft.** On the Summary page, a *Draft narrative* action produces a 120-word paragraph from the assumptions register and the headline metrics: what is being built, where, the key assumptions and their sources, and the range of returns. The user edits it; the stored text is theirs. The model is instructed to state ranges, never a single IRR, and to cite the register's sources.

**10.5 Guardrails**

- Tool calls are the only way the assistant changes a deal; each is validated against the schema and applied with `source` set by the user's confirmation, never `calculated`.
- Prompts include the engine's numbers as data; any number in a model response that is not in the supplied data is rejected by a post-check (regex over currency and percentage tokens) and the response is regenerated once, then shown with a warning.
- All assistant text is labeled as drafted by the assistant until the user edits it.
- Token and request budgets per organization; conversation history is retained with the deal and deleted with it.

## 11. Architecture, stack and data model

A TypeScript monorepo with one pure engine package, one set of React page components shared by the web app and the PDF renderer, a Next.js app for everything else, and Postgres for state.

&#91;embedded content: system architecture: 3 clients, 1 server, 4 packages, 5 stores and services\]

The browser screens, the share viewer and the PDF renderer all talk to the same server; the server's modules call the four shared packages, and only the engine computes. Everything below the server is storage or an external API.

**11.1 Repository layout**

```
pencil/
  apps/
    web/            Next.js 15 (App Router): deal screens, share viewer, package routes, server actions
    render/         Playwright + Chromium container: renders package routes to PDF on request
    cli/            `pencil run deal.json` → outputs JSON, package HTML, PDF, XLSX (used from M1, before the web app exists)
  packages/
    engine/         @pencil/engine — pure; zod schema is the source of truth for DealInputs; no runtime deps
    package-pages/  @pencil/package-pages — React components for the nine pages, props = DealOutputs + Version metadata
    benchmarks/     @pencil/benchmarks — schema, loader, resolution, flags; seed CSV template
    parcels/        @pencil/parcels — Massachusetts town table, tax rates, parcel lookup (or stub)
    assistant/      @pencil/assistant — Anthropic SDK wrapper, tools, prompts, post-checks
    db/             @pencil/db — Drizzle schema, migrations, typed queries
    exports/        @pencil/exports — XLSX builder (exceljs), PDF client for apps/render
  reference/        the five Excel workbooks used for golden tests (see section 12)
  docs/             SPEC.md (this document), decisions.md, progress.md, later.md
```

**11.2 Stack and choices**

| Concern | Choice | Why |
| --- | --- | --- |
| Language, tooling | TypeScript strict, Node 22, pnpm workspaces, Turborepo, ESLint, Prettier | One language across engine, UI and exports |
| Engine schema | zod in `@pencil/engine`; TS types inferred; JSON Schema generated for docs and the assistant's tools | One definition of every input, its unit, default and `elaborable` flag |
| Web | Next.js App Router, React 19, Tailwind, shadcn/ui, react-hook-form + zod | Server actions for mutations; package routes render the same components the PDF uses |
| Database | Postgres (Neon), Drizzle ORM, JSONB for deal state | Deal state is a document; history and versions are tables |
| Auth | Auth.js: email magic link and Google | No passwords to manage |
| Files | S3-compatible object storage (Cloudflare R2), signed URLs | PDFs and workbooks per Version |
| PDF | `apps/render`: Playwright Chromium in a container (Fly.io or Railway), called by the web app with a Version id and a signed token | Chromium is too heavy for serverless functions; one service, one job |
| XLSX | exceljs | Writes real `SUM` formulas and number formats |
| Billing | Stripe Checkout and webhooks → `entitlements` table | Per-deal purchase and Pro subscription with no custom payment UI |
| AI | Anthropic SDK with tool use, server-side only | Section 10 |
| Hosting | Vercel (web), Neon (db), R2 (files), Fly.io (render), Sentry | Small, boring, cheap at V1 scale |
| Tests | Vitest (packages), fast-check (property tests), Playwright (e2e) | Section 12 |

**11.3 Data model** (Postgres; all ids UUID; all tables carry `created_at`)

| Table | Columns (abridged) | Notes |
| --- | --- | --- |
| `organizations` | name, letterhead\_key, settings jsonb, tier | Settings per FR-11.1 |
| `users`, `memberships` | email, name; user\_id, org\_id, role (`owner`, `member`, `reviewer`) |  |
| `deals` | org\_id, name, address jsonb, town, is\_template, cloned\_from, created\_by, updated\_at, rev | `rev` for optimistic concurrency |
| `deal_state` | deal\_id (pk), inputs jsonb, elaboration jsonb, switches jsonb, events jsonb, scenarios jsonb, sensitivities jsonb, package\_settings jsonb, assistant\_transcript jsonb | One document; every input carries FR-1.1 metadata and its resolved benchmark id |
| `input_history` | deal\_id, scenario, path, prior\_value jsonb, prior\_source, prior\_note, changed\_by, changed\_at | Append-only; written in the same transaction as the state change |
| `versions` | deal\_id, number, snapshot jsonb (full deal\_state), outputs jsonb (DealOutputs per scenario), engine\_version, created\_by, reviewed\_by, reviewed\_at | Immutable; never updated after insert except `reviewed_*` |
| `files` | version\_id, kind (`pdf`, `xlsx`), storage\_key, bytes |  |
| `shares` | version\_id, token (32 random bytes, base64url), expires\_at, revoked\_at, created\_by | Read-only viewer resolves token → version |
| `benchmarks` | per section 9.1 | Seed rows have null `contributor_org_id` |
| `towns` | town, cluster, residential\_tax\_rate, assessor\_url, mbta\_status | Loaded from a CSV in `@pencil/parcels` |
| `contributions` | org\_id, metric, segment jsonb, value, exported\_month | Anonymized per 9.6 |
| `entitlements` | org\_id, deal\_id (nullable), kind (`per-deal`, `pro`), valid\_until, stripe\_ref | Checked at export and share |

**11.4 Server actions (the API surface)**

`createDeal(from: address | clone | template)`, `updateInputs(dealId, rev, patches[])` (each patch: path, scenario, value, source, note; writes history), `setElaboration(dealId, rev, path, children[])`, `setSwitch(dealId, rev, key, on, values?)`, `upsertEvent`, `deleteEvent`, `runSensitivity(dealId, spec)`, `createVersion(dealId)`, `exportFile(versionId, kind)`, `createShare(versionId, expiresAt?)`, `revokeShare`, `diffVersions(a, b)`, `cloneDeal`, `markTemplate`, `assistantMessage(dealId, text)`, `explainCell(versionId | dealId, cellRef)`. Every action checks org membership and, for export and share, entitlement. Engine runs happen on the server in the action and in the browser for instant results; both use the same package at the same version, and the Version stores the server's output.

**11.5 Security and privacy**

Organization-scoped queries everywhere; share tokens are unguessable and revocable; files are served only via short-lived signed URLs; the assistant receives only the deal it is asked about; contributions never include address, name, notes or free text; deletion of a deal deletes its history, versions, files, shares and transcript.

## 12. Testing strategy

Trust is the product, so the engine is tested four ways before any UI exists: unit tests per formula, invariants on every run, golden tests against the reference workbooks, and property tests on random deals. The web app gets end-to-end tests on the nine-step flow.

**12.1 Unit tests** (Vitest, `packages/engine/test/`)

One test file per subsection of section 7. Each formula gets at least one hand-computed case written in the test as a comment showing the arithmetic. Minimum cases:

- Largest-remainder unit rounding sums to `totalUnits` for mixes that do not divide evenly.
- S-curve weights: length `C`, sum 1 within 1e-12, symmetric, peak at the middle; `C = 1` yields `[1]`.
- Soft cost split: `predevShare` over `[0, P)`, remainder over `[P, O)`; `P = 0` puts everything in construction.
- `amortize`: a $1,000,000 loan at 6% over 30 years has a level payment of $5,995.51; with 24 IO months the first 24 rows are interest only; the final balance is 0 within $0.01.
- IRR: a series of `−100` then `+110` after 12 months returns 10% annual; a series with no sign change returns `null`.
- Waterfall: a single-tier pro rata structure returns LP IRR = GP IRR = project IRR; a two-tier structure with a hurdle below the project IRR gives the GP a higher IRR than the LP; tier capacities never pay the LP past its hurdle balance.
- Fixed point: a deal with `ltc = 0` converges in one iteration with zero interest; a deal with `ltc = 0.65` converges in under 10 iterations and capitalized interest equals the sum of monthly interest rows.
- Permanent loan sizing: when `L_DSCR < L_LTV` the loan equals `L_DSCR` and first-year DSCR equals `minDSCR` within 1e-6; the reverse case gives LTV × value.
- Residual land value: for a deal whose yield on cost already equals the target, RLV equals `landCost` within $100.

**12.2 Invariants** (run inside `run()` in test builds and asserted by a `checkInvariants(outputs)` helper in every test)

1. Sources equal uses to within $0.01 before rounding, in every month and in total.
2. Loan balance at refinance equals cumulative draws plus cumulative capitalized interest; permanent balance at sale equals the amortization schedule's balance.
3. Total equity contributions equal `TPC − Lc − M` plus any refinance shortfall and post-refinance deficits.
4. Cumulative distributions by partner sum to total distributions; every tier's payout is non-negative; the LP's hurdle balance for a completed tier is zero within $0.01.
5. No capitalized cost occurs after month `R`; no operating income occurs before month `O`.
6. Scenario Likely with empty overrides equals a plain `run`; sensitivity cell (base, base) equals the scenario run.
7. Monotonicity: raising exit cap lowers sale value and project IRR; raising hard cost $/SF lowers yield on cost; raising rents raises NOI in every operating month.
8. Running the same inputs twice yields byte-identical outputs (determinism).

**12.3 Golden tests against the reference workbooks** (`reference/`, `packages/engine/test/golden/`)

The five workbooks are Mark's and public models; their cached values are the standard the engine must reproduce. Procedure:

1. With Python (`openpyxl` with `data_only=True` for `.xlsm`, `pyxlsb` for `.xlsb`), write `scripts/extract-golden.py` that reads each workbook's input cells and the cached values of its key outputs and writes `golden/<model>.json` with `{ inputs, expected: { tpc, equity, loanAmount, capitalizedInterest, stabilizedNOI, saleValue, unleveredIRR, leveredIRR, lpIRR, gpIRR, equityMultiple, annualNOI[], annualDebtService[] } }`. Record the cell addresses used in the JSON so the mapping is auditable.
2. Map each workbook's inputs to `DealInputs` in a per-model adapter in the test (`adapters/<model>.ts`), documenting every assumption the workbook makes that the engine expresses differently (for example interest-only during construction, or a different S-curve). Where the workbook uses a convention the engine does not support, set the engine input that best matches and record the expected tolerance for that metric.
3. Assert each metric within tolerance: money within 0.5% or $1,000, whichever is larger; IRRs within 0.25 percentage points; annual series within 1% per year. Tighten tolerances as adapters improve; a tightened tolerance is a commit.
4. Priority order: `915 E Bethany Home Rd BOE 20211116v03 PPM Version.xlsm` (Mark's own multifamily development model) first and to the tightest tolerance; then `Student_Housing_Development_v18.xlsm`; then `ApartmentDevelopmentModel_v2.95.xlsm`; then `AustellModel20190113v01_ed1.7mm.xlsm` (an acquisition model: use its amortization, waterfall and sale sections only); then `A.CREAi1UW_v0.893.xlsb` (use its debt and waterfall tabs only).

If a workbook cannot be parsed or lacks cached values, say so in `docs/progress.md`, build the adapter from the visible formulas instead, and do not silently skip it.

**12.4 Property tests** (fast-check)

Generate random valid `DealInputs` (units 20–300, hold 60–180 months, rates 3–12%, LTC 0–0.75, curves of each kind, 0–3 events, each switch on or off) and assert the invariants of 12.2 hold on every generated deal; shrink and record any failure as a regression fixture.

**12.5 Package and export tests**

- Render each package page for a fixture deal to PNG and compare against a stored snapshot (Playwright screenshot assertions); review the first snapshots by eye and commit them.
- Open the XLSX with exceljs and assert: seven sheets, totals are `SUM` formulas, number formats match section 7.13, the Annual sheet's NOI row equals the engine's annual NOI.
- Sources & uses page totals equal `outputs.totals.tpc` after rounding rules are applied to parts and total independently.

**12.6 End-to-end** (Playwright against a seeded local database)

The nine-step walkthrough of section 5 as one test: create from a Needham address, accept defaults, change two inputs with notes, elaborate hard cost into three children, add one inflow event, turn commercial on and off, set a Worst override, run a preset sensitivity, export PDF and Excel, create a share link, open it logged out, confirm the assumptions register shows the two notes. Plus: history is appended on every change; a Free organization is blocked at export with the upgrade prompt; a revoked share returns 404.

**12.7 Definition of done for tests**

CI runs unit, invariant, golden and property tests on every push and e2e on main; coverage of `packages/engine` at or above 95% lines; no `.skip` or `.only` committed.

## 13. Milestones and acceptance criteria

Ten milestones in strict order; each ends with a commit, a `docs/progress.md` entry naming what was verified and how, and a short demo script in `docs/demos/<milestone>.md`. The engine is usable from the command line by M3, before any screen exists.

| # | Milestone | Deliverable | Acceptance criteria |
| --- | --- | --- | --- |
| M0 | Scaffold | Monorepo per 11.1, CI running lint, typecheck and an empty test suite; `docs/` files created; the five workbooks copied into `reference/` | `pnpm test` and `pnpm lint` pass in CI on a clean clone |
| M1 | Engine core | `@pencil/engine`: zod schema with defaults, timeline, program, cost lines and distributions, events, funding order, construction interest with the fixed point, `validate` | Unit tests for 7.3–7.6; invariants 1, 2, 5, 8 pass; a fixture deal runs in under 50 ms |
| M2 | Engine operations and capital | Lease-up, operations, permanent loan, sale, waterfall, metrics, `amortize`, `explain` trace | Unit tests for 7.7–7.11; all invariants pass; property tests run 500 cases green |
| M3 | Engine analysis and CLI | Scenarios, sensitivity grids, residual land value; `apps/cli` runs a JSON deal and writes outputs JSON plus a plain HTML package; golden tests for the Bethany Home and student-housing workbooks | Golden tolerances of 12.3 met for those two models; CLI documented in `docs/demos/m3.md` |
| M4 | Package pages and exports | `@pencil/package-pages` for all nine pages; `apps/render` producing the PDF; XLSX export; letterhead | Snapshot tests for nine pages; XLSX assertions of 12.5 pass; PDF of the fixture deal generated in under 10 s and reviewed page by page as PNG |
| M5 | Web app: deals and inputs | Auth, organizations, deal list, Setup and Inputs screens, twelve inputs with metadata, history, benchmarks with seed template, flags, elaboration, events, switches | E2E steps 1–6 of section 5 pass; history rows written on every change; concurrent edit returns a rev conflict, not silent overwrite |
| M6 | Web app: results, scenarios, sensitivities | Results screen with live recompute, scenario selector and compare, sensitivity presets and custom grids, stale marking | E2E steps 7–8 pass; results update within 200 ms of an input change on the fixture deal |
| M7 | Web app: package, versions, sharing | Package screen, Version creation, PDF and XLSX download, share links with expiry and revoke, read-only viewer, diff versions, clone and templates | E2E step 9 and the share and revoke cases pass; a share opened on a phone-width viewport is readable |
| M8 | Benchmarks and parcels | Town table loaded; parcel lookup or documented stub; benchmark resolution by segment; opt-in contribution and nightly percentile job | New deal from a Needham address resolves town cluster and tax rate; flags show for an out-of-range input; contributions contain no address or text |
| M9 | Assistant | Guided intake, explain-this-number, flag sentences, narrative draft with post-checks | Intake fills a deal end to end from a scripted conversation in a test with a recorded model response; a response containing a number absent from the data is rejected and regenerated |
| M10 | Billing and launch | Stripe Checkout for Per-deal and Pro, webhooks, entitlement checks, Free-tier gating, Sentry, production deploy, backup and restore drill | A Free org is blocked at export with an upgrade prompt; a test purchase unlocks export within one webhook cycle; restore from backup verified once |

**Order exceptions.** M4's page components may be started during M3 using CLI output as fixtures. M8's town table may be loaded during M5 so Setup has real data. Nothing else may be reordered without a `docs/decisions.md` entry.

## 14. Non-functional requirements and open questions

**14.1 Non-functional requirements**

| Requirement | Target |
| --- | --- |
| Engine run | Under 50 ms for a 120-month deal with 30 elaborated lines; under 200 ms end to end in the browser |
| Sensitivity grid | 9 × 9 grid under 2 s on the server |
| PDF export | Under 10 s for nine pages; under 20 s with the monthly appendix |
| Determinism | Same inputs and engine version → identical outputs, byte for byte |
| Persistence | Autosave on every change with optimistic concurrency; no manual save; no lost edits on reload |
| History | Every input change recorded with author and time; never purged while the deal exists |
| Availability | Single region; daily backups; restore drill once before launch |
| Browser support | Current Chrome, Safari, Firefox, Edge; share viewer readable at 375 px width |
| Accessibility | Keyboard-navigable inputs; labels on every field; contrast per WCAG AA on package pages |
| Privacy | Organization isolation; contributions anonymized per 9.6; deletion cascades |
| Observability | Sentry on web and render; structured logs with deal and version ids; export timing recorded |
| Cost | Infrastructure under $150/month at 100 active organizations |

**14.2 Open questions for Mark** (answers go in `docs/decisions.md`; defaults below apply until answered)

| Question | Default used until answered |
| --- | --- |
| Default waterfall structure for the organization settings | Pro rata to 8%, then 70/30 to 15%, then 50/50 |
| Soft cost split between predevelopment and construction | 60% predevelopment, 40% construction |
| Lease-up absorption basis | Linear over the lease-up months |
| Post-completion property tax basis | `taxesStabilizedAnnual` input, defaulted from town rate × an assessment ratio of 85% of stabilized value |
| Whether lease-up operating deficits are typically funded by the construction loan | Yes (`capitalizeOperatingDeficits = true`) |
| Typical Massachusetts construction loan terms in late 2026 (LTC, spread, fee) | 65% LTC, 8.0%, 1% fee |
| Typical permanent loan sizing (LTV, DSCR, amortization) | 65%, 1.25×, 30 years |
| Which nine pages a community bank actually asks for, and in what order | As listed in section 8 |
| Seed values for every row of the benchmark list in 9.2 | Schema defaults; flags disabled for metrics with no seed |
| Town clusters: which towns belong to which cluster | Agent proposes a mapping by commuter-rail zone and median rent; Mark corrects |

**14.3 Assumptions the agent may make without asking**

All loans accrue monthly at nominal annual rate ÷ 12; the analysis month is the first of the month; years in annual tables are twelve-month periods from month 0, not calendar years; the GP contributes owned land in kind at the ascribed value; unit counts round by largest remainder; broker fee and closing costs are percentages of gross sale value.

## 15. Kickoff prompt for Claude Code

Export this document as Markdown, save it as `docs/SPEC.md` in an empty repository, copy the five workbooks into `reference/`, then start Claude Code in the repository and paste the prompt below. Run it once per milestone, changing only the milestone number.

```markdown
You are building Pencil, a Massachusetts multifamily feasibility tool. The complete product
requirements and technical specification are in docs/SPEC.md. Read the whole file before
doing anything else, then follow its section 1 working agreement exactly.

Your task now is Milestone M0 as defined in section 13. Do not start M1 until M0's
acceptance criteria pass and you have recorded what you verified in docs/progress.md.

Rules that override your defaults:
1. Sections 7 and 12 of the spec are binding. Implement formulas exactly as written.
2. The engine (packages/engine) is pure: no I/O, no clock, no randomness, no dependencies.
3. Write tests before implementation for every formula; never commit a skipped test.
4. When something is ambiguous, pick the simplest reading consistent with section 2,
   write a dated entry in docs/decisions.md with the alternative you rejected, and continue.
   Ask me only if the ambiguity changes the data model or the money math.
5. Do not build anything listed as out of scope in section 3. Put ideas in docs/later.md.
6. Verify every claim: run the tests, render PDFs to PNG and look at them, open the XLSX.
7. Commit at the end of the milestone with a message that names it, and summarize in
   docs/progress.md: what was built, what was verified, how, and what is left.

When the milestone is complete, stop and report: the acceptance criteria and their status,
any decisions you recorded, and any open questions from section 14.2 you needed an answer to.
```

**After M3**, add this line to the prompt for the golden tests: "Run `scripts/extract-golden.py` against `reference/` first; if a workbook fails to parse, record it in `docs/progress.md` and continue with the others."

**After M4**, add: "Before marking M4 done, attach the fixture deal's PDF pages as PNGs in `docs/demos/m4/` and list anything that looks wrong."

**When reviewing a milestone yourself**, check three things in order: the tests actually exercise the formulas of section 7 (read two test files), `docs/decisions.md` contains no decision that contradicts section 2, and the demo script runs on a clean clone.
