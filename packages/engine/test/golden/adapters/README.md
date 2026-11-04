# Adapters

One file per model, exporting `adapt(golden)`; see `_template.ts`. Document every assumption the
workbook makes that the engine expresses differently (interest-only during construction, a
different S-curve, calendar-year tables, ...) in `notes`, and widen the per-metric tolerance for
any convention the engine does not support. The test prints the notes so the mapping is auditable.
