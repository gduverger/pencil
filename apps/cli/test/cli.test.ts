import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, parseArgs, runCommand, usage } from '../src/cli';

const example = join(__dirname, '..', 'examples', 'needham-60.json');

describe('pencil run', () => {
  it('parses arguments', () => {
    expect(
      parseArgs(['run', 'deal.json', '--out', 'x', '--no-rlv', '--pdf', '--xlsx', '--plain']),
    ).toEqual({
      dealPath: 'deal.json',
      outDir: 'x',
      rlv: false,
      pdf: true,
      xlsx: true,
      plain: true,
    });
    expect('error' in parseArgs([])).toBe(true);
    expect('error' in parseArgs(['run', 'deal.json', '--bogus'])).toBe(true);
    expect(usage()).toContain('pencil run');
  });

  it('writes outputs.json, summary.json, package.html and the XLSX for the example deal', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'pencil-cli-'));
    const { summary } = await runCommand({
      dealPath: example,
      outDir,
      rlv: true,
      pdf: false,
      xlsx: true,
      plain: true,
      now: '2026-11-04T00:00:00.000Z',
    });
    expect(existsSync(join(outDir, 'outputs.json'))).toBe(true);
    expect(existsSync(join(outDir, 'summary.json'))).toBe(true);
    const html = readFileSync(join(outDir, 'package.html'), 'utf8');
    expect(html).toContain('data-page="assumptions"');
    expect(html).toContain('Figures rounded; totals may not foot.');
    expect(html).toContain('Relocate historic house');
    expect(html).toContain('data-page="sensitivities"');
    expect(readFileSync(join(outDir, 'package-plain.html'), 'utf8')).toContain(
      'Assumptions register',
    );
    expect(summary.files).toContain('needham-60-example-deal-likely-2026-11-04.xlsx');
    expect(readdirSync(outDir).some((f) => f.endsWith('.xlsx'))).toBe(true);
    expect(summary.scenarios.likely.projectIrr).toBeTypeOf('number');
    expect(summary.scenarios.best.projectIrr!).toBeGreaterThan(
      summary.scenarios.likely.projectIrr as number,
    );
    expect(summary.residualLandValue).not.toBeNull();
    const outputs = JSON.parse(readFileSync(join(outDir, 'outputs.json'), 'utf8'));
    expect(Object.keys(outputs.outputs)).toEqual(['likely', 'best', 'worst']);
    expect(outputs.outputs.likely.months).toHaveLength(121);
  });

  it('rejects an invalid deal with a readable message and exit code 1', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'pencil-cli-'));
    const bad = join(outDir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ meta: { holdMonths: 10 } }));
    expect(await main(['run', bad, '--out', outDir])).toBe(1);
    expect(await main([])).toBe(2);
    expect(await main(['run', example, '--out', outDir, '--no-rlv'])).toBe(0);
  });
});
