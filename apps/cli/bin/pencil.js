#!/usr/bin/env node
// Thin launcher: runs the TypeScript CLI through tsx so no build step is needed. The tsconfig
// passed to tsx covers the workspace packages so their JSX compiles with the automatic runtime.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'src', 'cli.ts');
const result = spawnSync(process.execPath, ['--import', 'tsx', entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, TSX_TSCONFIG_PATH: join(here, '..', 'tsconfig.tsx.json') },
});
process.exit(result.status ?? 1);
