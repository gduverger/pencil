import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { arbDeal } from './arb-deal';
import { join } from 'node:path';
import { run } from '../src/run';
import { checkInvariants } from '../src/invariants';
import { parseInputs } from '../src/schema';
import { validate, hasErrors } from '../src/validate';

const SEED = Number(process.env.FC_SEED ?? Date.now() % 1_000_000_000);
const LOG = process.env.FC_LOG;
console.log(`fast-check seed ${SEED}`);
import { writeFileSync } from 'node:fs';

describe('12.4 property tests', () => {
  it('every random valid deal satisfies invariants 1–5 (500 cases)', () => {
    fc.assert(
      fc.property(arbDeal(), (deal) => {
        if (LOG) writeFileSync(LOG, JSON.stringify(deal));
        const issues = validate(deal);
        if (hasErrors(issues)) throw new Error(`generator produced an invalid deal: ${issues.map((i) => i.code).join(', ')}`);
        const out = run(deal);
        const violations = checkInvariants(out);
        if (violations.length > 0) {
          throw new Error(violations.map((v) => `[${v.invariant}] ${v.message}`).join('\n'));
        }
        // every number in the outputs is finite
        for (const m of out.months) {
          if (!Number.isFinite(m.noi) || !Number.isFinite(m.loanBalance) || !Number.isFinite(m.distributions.lp)) throw new Error(`non-finite value at month ${m.t}`);
        }
      }),
      { numRuns: 500, verbose: true, seed: SEED, interruptAfterTimeLimit: 60_000, markInterruptAsFailure: true },
    );
  });

  it('runs twice deterministically on random deals (50 cases)', () => {
    fc.assert(
      fc.property(arbDeal(), (deal) => {
        if (LOG) writeFileSync(LOG, JSON.stringify(deal));
        expect(JSON.stringify(run(deal))).toBe(JSON.stringify(run(deal)));
      }),
      { numRuns: 50, seed: SEED + 1, interruptAfterTimeLimit: 30_000, markInterruptAsFailure: true },
    );
  });

  it('replays recorded regression fixtures, if any', () => {
    const dir = join(__dirname, 'regressions');
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const deal = parseInputs(JSON.parse(readFileSync(join(dir, file), 'utf8')));
      expect(checkInvariants(run(deal)), file).toEqual([]);
    }
  });
});
