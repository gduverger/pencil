/**
 * pencil run <deal.json> [--out <dir>] [--scenarios <scenarios.json>] [--no-rlv]
 *
 * Runs the engine on a deal file and writes outputs JSON, a summary and a package HTML file.
 * Every number is produced by @pencil/engine; this file only reads, writes and formats.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ENGINE_VERSION,
  residualLandValue,
  runScenarios,
  scenarioOverridesFromDeltas,
  validate,
  hasErrors,
  type ScenarioSet,
  type ScenarioKey,
  type DealOutputs,
} from '@pencil/engine';
import { renderPlainPackage } from './html';

export function usage(): string {
  return [
    'Usage: pencil run <deal.json> [--out <dir>] [--scenarios <scenarios.json>] [--no-rlv]',
    '',
    '  Runs the Pencil engine on a deal and writes, into <dir> (default ./pencil-out):',
    '    outputs.json   full DealOutputs for likely, best and worst',
    '    summary.json   headline metrics per scenario and the residual land value',
    '    package.html   the package pages as plain HTML',
    '',
    '  scenarios.json is { "best": { "<path>": value }, "worst": { ... } }; without it the default',
    '  deltas apply (rents ±5%, hard cost ∓10%).',
  ].join('\n');
}

export interface RunOptions {
  dealPath: string;
  outDir: string;
  scenariosPath?: string;
  rlv: boolean;
  now?: string;
}

export function parseArgs(argv: string[]): RunOptions | { error: string } {
  const [command, dealPath, ...rest] = argv;
  if (command !== 'run' || !dealPath) return { error: usage() };
  const opts: RunOptions = { dealPath, outDir: 'pencil-out', rlv: true };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === '--out') opts.outDir = rest[++i] ?? opts.outDir;
    else if (arg === '--scenarios') opts.scenariosPath = rest[++i];
    else if (arg === '--no-rlv') opts.rlv = false;
    else return { error: `Unknown argument ${arg}\n\n${usage()}` };
  }
  return opts;
}

export interface Summary {
  deal: string;
  engineVersion: string;
  generatedAt: string;
  scenarios: Record<ScenarioKey, Record<string, number | string | null>>;
  residualLandValue: ReturnType<typeof residualLandValue> | null;
  flags: Record<ScenarioKey, Array<{ code: string; message: string; path?: string }>>;
}

function headline(o: DealOutputs): Record<string, number | string | null> {
  return {
    projectIrr: o.metrics.projectIrr,
    lpIrr: o.metrics.lpIrr,
    gpIrr: o.metrics.gpIrr,
    unleveredIrr: o.metrics.unleveredIrr,
    equityMultiple: o.metrics.equityMultiple,
    yieldOnCost: o.metrics.yieldOnCost,
    developmentSpread: o.metrics.developmentSpread,
    totalProjectCost: o.totals.tpc,
    costPerUnit: o.metrics.costPerUnit,
    costPerGSF: o.metrics.costPerGSF,
    totalEquity: o.totals.totalContributions,
    peakEquity: o.metrics.peakEquity,
    profit: o.metrics.profit,
    saleValue: o.sale.value,
    iterations: o.diagnostics.iterations,
  };
}

export function runCommand(opts: RunOptions): { outDir: string; summary: Summary; issues: ReturnType<typeof validate> } {
  const raw = JSON.parse(readFileSync(resolve(opts.dealPath), 'utf8')) as unknown;
  const issues = validate(raw);
  if (hasErrors(issues)) {
    const message = issues.filter((i) => i.level === 'error').map((i) => `  ${i.path ?? ''}: ${i.message}`).join('\n');
    throw new Error(`The deal file is invalid:\n${message}`);
  }
  const scenarios: ScenarioSet = opts.scenariosPath
    ? (JSON.parse(readFileSync(resolve(opts.scenariosPath), 'utf8')) as ScenarioSet)
    : scenarioOverridesFromDeltas(raw);
  const outputs = runScenarios(raw, scenarios);
  const rlv = opts.rlv ? residualLandValue(raw) : null;
  const generatedAt = opts.now ?? new Date().toISOString();
  const summary: Summary = {
    deal: outputs.likely.inputs.meta.name,
    engineVersion: ENGINE_VERSION,
    generatedAt,
    scenarios: { likely: headline(outputs.likely), best: headline(outputs.best), worst: headline(outputs.worst) },
    residualLandValue: rlv,
    flags: { likely: outputs.likely.flags, best: outputs.best.flags, worst: outputs.worst.flags },
  };
  const outDir = resolve(opts.outDir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'outputs.json'), JSON.stringify({ engineVersion: ENGINE_VERSION, generatedAt, scenarios, outputs }, null, 2));
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(join(outDir, 'package.html'), renderPlainPackage(outputs, { generatedAt, engineVersion: ENGINE_VERSION }));
  return { outDir, summary, issues };
}

function pct(x: number | string | null | undefined): string {
  return typeof x === 'number' ? `${(x * 100).toFixed(1)}%` : 'n/a';
}

export function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    console.error(parsed.error);
    return 2;
  }
  try {
    const { outDir, summary, issues } = runCommand(parsed);
    for (const w of issues) console.warn(`warning: ${w.path ?? ''} ${w.message}`);
    const s = summary.scenarios;
    console.log(`${summary.deal} — engine ${summary.engineVersion}`);
    console.log(`  Project IRR   likely ${pct(s.likely.projectIrr)}  best ${pct(s.best.projectIrr)}  worst ${pct(s.worst.projectIrr)}`);
    console.log(`  LP IRR        likely ${pct(s.likely.lpIrr)}  best ${pct(s.best.lpIrr)}  worst ${pct(s.worst.lpIrr)}`);
    console.log(`  Yield on cost likely ${pct(s.likely.yieldOnCost)}  best ${pct(s.best.yieldOnCost)}  worst ${pct(s.worst.yieldOnCost)}`);
    console.log(`  Total cost    likely ${Math.round(Number(s.likely.totalProjectCost)).toLocaleString('en-US')}`);
    if (summary.residualLandValue) {
      const r = summary.residualLandValue;
      const bound = r.atBound === 'low' ? ' (target not reachable even with free land)' : r.atBound === 'high' ? ' (target still met at the top of the bracket)' : '';
      console.log(`  Residual land value at ${pct(r.targetYieldOnCost)} yield on cost: ${Math.round(r.landCost).toLocaleString('en-US')} (${Math.round(r.perUnit).toLocaleString('en-US')} per unit)${bound}`);
    }
    for (const k of ['likely', 'best', 'worst'] as const) for (const f of summary.flags[k]) console.log(`  flag [${k}] ${f.code}: ${f.message}`);
    console.log(`  wrote ${outDir}/outputs.json, summary.json, package.html`);
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
