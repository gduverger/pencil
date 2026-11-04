import { defineConfig, devices } from '@playwright/test';

// End-to-end tests (spec 12.6) run against a production build with the embedded PGlite database and
// the development sign-in provider. `pnpm build` must have run first (CI does it in the e2e job).
const port = Number(process.env.PENCIL_E2E_PORT ?? 3100);
const baseURL = process.env.PENCIL_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PENCIL_BASE_URL
    ? undefined
    : {
        command: `rm -rf .data/e2e .data/e2e-files && PORT=${port} PENCIL_DEV_AUTH=1 PENCIL_DEFAULT_TIER=pro PENCIL_FILES_DIR=.data/e2e-files PENCIL_SEED_BENCHMARKS=e2e/fixtures/benchmarks-e2e.csv AUTH_SECRET=e2e-secret DATABASE_URL=pglite://./.data/e2e AUTH_URL=${baseURL} PENCIL_BASE_URL=${baseURL} pnpm start -p ${port}`,
        url: `${baseURL}/signin`,
        timeout: 120_000,
        reuseExistingServer: false,
      },
});
