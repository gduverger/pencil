# Golden mappings

One JSON file per reference workbook (spec 12.3). Each maps the engine's input and expected-output
names to workbook cells as `Sheet!A1` (an annual series is a list of cells). `scripts/extract-golden.py`
reads the cached values and writes `packages/engine/test/golden/<model>.json`; the per-model
adapter in `packages/engine/test/golden/adapters/<model>.ts` turns the extracted inputs into
`DealInputs` and documents every convention the workbook uses differently.

The workbooks were not supplied with the specification, so every cell address below is `TBD`.
When a workbook is added to `reference/`, fill in its addresses, run the script, write the adapter,
and tighten the tolerances in the adapter as it improves (a tightened tolerance is a commit).

Priority order (12.3): Bethany Home first and tightest, then Student Housing, then Apartment
Development v2.95, then Austell (amortization, waterfall and sale only), then A.CRE (debt and
waterfall tabs only).
