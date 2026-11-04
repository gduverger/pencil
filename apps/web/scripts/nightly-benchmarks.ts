/** Local/cron entry for the nightly benchmark recompute: `pnpm --filter @pencil/web nightly`. */
import { createDb, recomputeContributedBenchmarks } from '@pencil/db';

const url = process.env.DATABASE_URL ?? 'pglite://./.data/pencil';
const handle = await createDb({ url });
try {
  const result = await recomputeContributedBenchmarks(
    handle.db,
    new Date().toISOString().slice(0, 7),
  );
  console.log(
    JSON.stringify(
      {
        segmentsSeen: result.segmentsSeen,
        rangesWritten: result.rangesWritten,
        written: result.written,
      },
      null,
      2,
    ),
  );
} finally {
  await handle.close();
}
