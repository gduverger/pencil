import { describe, expect, it } from 'vitest';
import { run } from '../src/run';
import { fixtureDeal } from './fixtures';

describe('performance (14.1)', () => {
  it('runs the 120-month fixture deal with 30 elaborated lines in under 50 ms', () => {
    const deal = fixtureDeal();
    const lines = Array.from({ length: 30 }, (_, i) => ({ label: `Line ${i + 1}`, amount: 600_000 }));
    const elaborated = { ...deal, costs: { ...deal.costs, hard: { ...deal.costs!.hard, lines } } };
    run(elaborated); // warm up
    const runs = 20;
    const start = performance.now();
    for (let i = 0; i < runs; i++) run(elaborated);
    const perRun = (performance.now() - start) / runs;
    expect(perRun).toBeLessThan(50);
  });
});
