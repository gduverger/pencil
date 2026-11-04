# Golden tests

`golden.test.ts` replays every `<model>.json` in this directory against the engine through the
adapter in `adapters/<model>.ts` and asserts the tolerances of spec 12.3: money within 0.5% or
$1,000 (whichever is larger), IRRs within 0.25 percentage points, annual series within 1% per
year. A JSON without an adapter fails loudly; no model is skipped silently.

No JSON files exist yet because the five reference workbooks were not supplied (see
`reference/README.md`). Produce them with:

```bash
python3 scripts/extract-golden.py reference/ packages/engine/test/golden/
```

after filling in the cell addresses in `scripts/golden-mappings/*.json`.
