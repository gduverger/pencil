# Benchmark seed template

`benchmarks.csv` lists every row of the seed list in spec 9.2 with empty `low`, `mid`, `high`,
`as_of`, `source` and `sample_size` columns. Mark provides the values; until a row is filled in,
the input it covers defaults to the schema default and its out-of-range flag is disabled (14.2).

Columns: `metric` is the input path the benchmark applies to (FR-1.3); the segment columns
`town_cluster`, `construction_type`, `unit_type`, `project_size` scope it (leave blank for "any");
`unit` is the input unit; `as_of` is `YYYY-MM`; `source` is free text such as "Mark — 2025 bids,
4 projects"; `sample_size` is the number of observations when known.

`operations.assessmentRatio` is not an engine input: it is the ratio of assessed value to
stabilized value used to default stabilized property taxes from the town rate (14.2).

Load with `loadBenchmarksCsv()` or seed the database with `pnpm --filter @pencil/db seed`.
