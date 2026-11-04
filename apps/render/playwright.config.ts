import { defineConfig } from '@playwright/test';

// Page snapshot tests (spec 12.5): each package page rendered to PNG and compared with the
// committed snapshot. Run with `pnpm --filter @pencil/render test:snapshots`.
export default defineConfig({
  testDir: './test',
  testMatch: /.*\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002 } },
  use: { deviceScaleFactor: 1 },
});
