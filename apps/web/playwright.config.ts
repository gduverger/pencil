import { defineConfig, devices } from '@playwright/test';

// End-to-end tests (spec 12.6) run against a production build with the embedded PGlite database and
// the development sign-in provider. `pnpm build` must have run first (CI does it in the e2e job).
// Two servers start: the Pro-tier one for the walkthrough and a Free-tier one (with a webhook
// secret) for the billing gating tests of M10.
const port = Number(process.env.PENCIL_E2E_PORT ?? 3100);
const baseURL = process.env.PENCIL_BASE_URL ?? `http://127.0.0.1:${port}`;
const freePort = Number(process.env.PENCIL_E2E_FREE_PORT ?? 3101);
const freeBaseURL = process.env.PENCIL_FREE_BASE_URL ?? `http://127.0.0.1:${freePort}`;

const common = 'PENCIL_DEV_AUTH=1 PENCIL_SEED_BENCHMARKS=e2e/fixtures/benchmarks-e2e.csv PENCIL_ASSISTANT_FAKE=1 AUTH_SECRET=e2e-secret';

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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /billing\.spec\.ts/ },
    { name: 'billing', use: { ...devices['Desktop Chrome'], baseURL: freeBaseURL }, testMatch: /billing\.spec\.ts/ },
  ],
  webServer: process.env.PENCIL_BASE_URL
    ? undefined
    : [
        {
          command: `rm -rf .data/e2e .data/e2e-files && PORT=${port} ${common} PENCIL_DEFAULT_TIER=pro PENCIL_FILES_DIR=.data/e2e-files DATABASE_URL=pglite://./.data/e2e AUTH_URL=${baseURL} PENCIL_BASE_URL=${baseURL} pnpm start -p ${port}`,
          url: `${baseURL}/signin`,
          timeout: 120_000,
          reuseExistingServer: false,
        },
        {
          command: `rm -rf .data/e2e-free .data/e2e-free-files && PORT=${freePort} ${common} PENCIL_DEFAULT_TIER=free STRIPE_WEBHOOK_SECRET=whsec_e2e PENCIL_FILES_DIR=.data/e2e-free-files DATABASE_URL=pglite://./.data/e2e-free AUTH_URL=${freeBaseURL} PENCIL_BASE_URL=${freeBaseURL} pnpm start -p ${freePort}`,
          url: `${freeBaseURL}/signin`,
          timeout: 120_000,
          reuseExistingServer: false,
        },
      ],
});
