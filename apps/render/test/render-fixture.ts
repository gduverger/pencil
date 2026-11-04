/**
 * Writes the fixture package HTML to a file. Run in its own Node process (tsx) because the
 * Playwright test runner rewrites JSX in the test process for component testing, which breaks
 * react-dom/server there.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fixtureHtml } from './fixture';

const out = process.argv[2];
if (!out) {
  console.error('usage: render-fixture.ts <out.html>');
  process.exit(2);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, fixtureHtml());
