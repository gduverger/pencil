import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.spec.ts'],
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
