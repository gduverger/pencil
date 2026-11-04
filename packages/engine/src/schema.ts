/**
 * The zod schema is the single definition of every input: its type, default, unit, label and
 * `elaborable` flag (spec 7.2 and 11.2). TypeScript types are inferred from it and the JSON
 * Schema used by the assistant's tools is generated from it.
 *
 * Conventions: every `*Pct` field is a decimal fraction (0.08 = 8%). Money is nominal USD.
 * The twelve "tonight" inputs are marked `star: true`.
 */
import { z } from 'zod';

export const UNITS = [
  'usd',
  'usd_per_sf',
  'usd_per_unit',
  'usd_per_unit_month',
  'pct',
  'sf',
  'units',
  'months',
  'rate_pct',
  'count',
  'text',
  'flag',
] as const;
export type Unit = (typeof UNITS)[number];

export const SOURCES = [
  'benchmark',
  'parcel-data',
  'my-number',
  'quote',
  'comp',
  'calculated',
  'unknown',
] as const;
export type Source = (typeof SOURCES)[number];

/** Metadata attached to every leaf input in the schema. */
export interface InputMeta {
  label: string;
  unit: Unit;
  /** One of the twelve "tonight" inputs. */
  star?: boolean;
  /** May be replaced by child line items that sum to it (FR-2.1). */
  elaborable?: boolean;
  /** Short plain-language explanation for the guided intake. */
  help?: string;
  [key: string]: unknown;
}

const num = (def: number, meta: InputMeta, refine?: (s: z.ZodNumber) => z.ZodNumber) =>
  (refine ? refine(z.number()) : z.number()).default(def).meta(meta);
const pct = (def: number, meta: Omit<InputMeta, 'unit'> & { unit?: Unit }) =>
  z
    .number()
    .min(0)
    .default(def)
    .meta({ unit: 'pct', ...meta });
const bool = (def: boolean, meta: Omit<InputMeta, 'unit'>) =>
  z.boolean().default(def).meta({ unit: 'flag', ...meta });

export const DistributionSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('scurve') }),
    z.object({ kind: z.literal('straight') }),
    z.object({ kind: z.literal('custom'), weights: z.array(z.number().min(0)) }),
  ])
  .meta({ title: 'Distribution', description: 'How a cost is spread over its window (7.4).' });
export type Distribution = z.infer<typeof DistributionSchema>;

/** A child line item of an elaborated cost (FR-2.1): the engine receives resolved amounts. */
export const CostLineSchema = z.object({
  label: z.string(),
  amount: z.number().min(0).meta({ label: 'Amount', unit: 'usd' }),
  distribution: DistributionSchema.optional(),
});
export type CostLine = z.infer<typeof CostLineSchema>;

export const UNIT_TYPE_KEYS = ['studio', '1BR', '2BR', '3BR'] as const;
export type UnitTypeKey = (typeof UNIT_TYPE_KEYS)[number];

export const UnitTypeSchema = z.object({
  key: z.enum(UNIT_TYPE_KEYS),
  mixPct: pct(0.25, { label: 'Share of units', star: true }),
  avgSF: num(700, { label: 'Average unit size', unit: 'sf', star: true }, (s) => s.min(0)),
  rentPerMonth: num(
    2800,
    { label: 'Market rent per month', unit: 'usd_per_unit_month', star: true },
    (s) => s.min(0),
  ),
});
export type UnitType = z.infer<typeof UnitTypeSchema>;

export const EVENT_KINDS = ['cost', 'inflow'] as const;
export const EVENT_CATEGORIES = ['land', 'hard', 'soft', 'other', 'inflow'] as const;
export const EventSchema = z.object({
  id: z.string(),
  label: z.string(),
  month: z.number().int().min(0).meta({ label: 'Month', unit: 'months' }),
  amount: z.number().min(0).meta({ label: 'Amount', unit: 'usd' }),
  kind: z.enum(EVENT_KINDS),
  category: z.enum(EVENT_CATEGORIES),
  note: z.string().optional(),
});
export type DealEvent = z.infer<typeof EventSchema>;

export const TierSchema = z.object({
  hurdleIrrPct: z.number().min(0).nullable().meta({ label: 'IRR hurdle', unit: 'rate_pct' }),
  lpSplit: z.number().min(0).max(1).meta({ label: 'LP split', unit: 'pct' }),
  gpSplit: z.number().min(0).max(1).meta({ label: 'GP split', unit: 'pct' }),
});
export type Tier = z.infer<typeof TierSchema>;

const DEFAULT_UNIT_TYPES: UnitType[] = [
  { key: 'studio', mixPct: 0.1, avgSF: 450, rentPerMonth: 2200 },
  { key: '1BR', mixPct: 0.4, avgSF: 650, rentPerMonth: 2700 },
  { key: '2BR', mixPct: 0.4, avgSF: 950, rentPerMonth: 3300 },
  { key: '3BR', mixPct: 0.1, avgSF: 1200, rentPerMonth: 3900 },
];

export const DEFAULT_TIERS: Tier[] = [
  { hurdleIrrPct: 0.08, lpSplit: 0.9, gpSplit: 0.1 },
  { hurdleIrrPct: 0.15, lpSplit: 0.7, gpSplit: 0.3 },
  { hurdleIrrPct: null, lpSplit: 0.5, gpSplit: 0.5 },
];

export const DealInputsSchema = z
  .object({
    meta: z
      .object({
        name: z.string().default('Untitled deal').meta({ label: 'Deal name', unit: 'text' }),
        analysisMonth: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .default('2026-01')
          .meta({ label: 'Analysis month (YYYY-MM)', unit: 'text' }),
        holdMonths: num(120, {
          label: 'Hold period',
          unit: 'months',
          star: true,
          help: 'Months from the analysis month to the sale.',
        }, (s) => s.int().min(1)),
      })
      .prefault({}),
    site: z
      .object({
        lotSF: num(0, { label: 'Lot area', unit: 'sf' }, (s) => s.min(0)),
        zoningDistrict: z.string().optional().meta({ label: 'Zoning district', unit: 'text' }),
        mbtaCommunitiesDistrict: z
          .boolean()
          .optional()
          .meta({ label: 'MBTA Communities district', unit: 'flag' }),
        landCost: num(
          0,
          {
            label: 'Land cost',
            unit: 'usd',
            star: true,
            help: 'Purchase price, or the ascribed value if the land is already owned.',
          },
          (s) => s.min(0),
        ),
        landOwned: bool(false, {
          label: 'Land already owned',
          help: 'Owned land is contributed in kind by the GP at month 0.',
        }),
        closingCostPct: pct(0.02, { label: 'Land closing costs (% of land)' }),
      })
      .prefault({}),
    program: z
      .object({
        totalUnits: num(60, { label: 'Total units', unit: 'units', star: true }, (s) =>
          s.int().min(1),
        ),
        unitTypes: z.array(UnitTypeSchema).default(DEFAULT_UNIT_TYPES),
        efficiency: num(
          0.85,
          { label: 'Efficiency (net rentable / gross)', unit: 'pct' },
          (s) => s.gt(0).max(1),
        ),
        otherIncomePerUnitMonth: num(
          75,
          { label: 'Other income (parking, fees)', unit: 'usd_per_unit_month' },
          (s) => s.min(0),
        ),
        affordable: z
          .object({
            enabled: bool(false, { label: 'Affordable units' }),
            pctUnits: pct(0.1, { label: 'Share of units affordable' }),
            rentDiscountPct: pct(0.3, { label: 'Affordable rent discount' }),
          })
          .prefault({}),
        commercial: z
          .object({
            enabled: bool(false, { label: 'Ground-floor commercial space' }),
            grossSF: num(0, { label: 'Commercial gross SF', unit: 'sf' }, (s) => s.min(0)),
            rentPerSFYear: num(30, { label: 'Commercial rent ($/SF/yr)', unit: 'usd_per_sf' }, (s) =>
              s.min(0),
            ),
            vacancyPct: pct(0.1, { label: 'Commercial vacancy' }),
            tiPerSF: num(50, { label: 'Tenant improvements ($/SF)', unit: 'usd_per_sf' }, (s) =>
              s.min(0),
            ),
            leaseUpMonths: num(6, { label: 'Commercial lease-up', unit: 'months' }, (s) =>
              s.int().min(0),
            ),
            opexPerSFYear: num(8, { label: 'Commercial opex ($/SF/yr)', unit: 'usd_per_sf' }, (s) =>
              s.min(0),
            ),
          })
          .prefault({}),
      })
      .prefault({}),
    timeline: z
      .object({
        predevMonths: num(12, { label: 'Predevelopment', unit: 'months', star: true }, (s) =>
          s.int().min(0),
        ),
        constructionMonths: num(18, { label: 'Construction', unit: 'months', star: true }, (s) =>
          s.int().min(1),
        ),
        leaseUpMonths: num(12, { label: 'Lease-up', unit: 'months', star: true }, (s) =>
          s.int().min(0),
        ),
      })
      .prefault({}),
    costs: z
      .object({
        hard: z
          .object({
            perGrossSF: num(
              350,
              { label: 'Hard cost per gross SF', unit: 'usd_per_sf', star: true, elaborable: true },
              (s) => s.min(0),
            ),
            contingencyPct: pct(0.05, { label: 'Hard cost contingency' }),
            distribution: DistributionSchema.default({ kind: 'scurve' }),
            lines: z.array(CostLineSchema).optional(),
          })
          .prefault({}),
        soft: z
          .object({
            pctOfHard: pct(0.25, { label: 'Soft cost (% of hard)', star: true, elaborable: true }),
            contingencyPct: pct(0.05, { label: 'Soft cost contingency' }),
            predevShare: num(
              0.6,
              { label: 'Soft cost share spent in predevelopment', unit: 'pct' },
              (s) => s.min(0).max(1),
            ),
            lines: z.array(CostLineSchema).optional(),
          })
          .prefault({}),
        carry: z
          .object({
            taxesDuringConstructionAnnual: num(
              0,
              { label: 'Property taxes during development (annual)', unit: 'usd', elaborable: true },
              (s) => s.min(0),
            ),
            insuranceDuringConstructionAnnual: num(
              0,
              { label: "Builder's risk insurance (annual)", unit: 'usd', elaborable: true },
              (s) => s.min(0),
            ),
          })
          .prefault({}),
        developerFeePct: pct(0, { label: 'Developer fee (% of hard + soft)' }),
      })
      .prefault({}),
    events: z.array(EventSchema).default([]),
    financing: z
      .object({
        constructionLoan: z
          .object({
            ltc: pct(0.65, { label: 'Construction loan-to-cost', star: true }),
            ratePct: num(0.08, { label: 'Construction loan rate', unit: 'rate_pct', star: true }, (s) =>
              s.min(0),
            ),
            feePct: pct(0.01, { label: 'Construction loan fee' }),
          })
          .prefault({}),
        landLoan: z
          .object({
            enabled: bool(false, { label: 'Land loan' }),
            ltv: pct(0.5, { label: 'Land loan-to-value' }),
            ratePct: num(0.09, { label: 'Land loan rate', unit: 'rate_pct' }, (s) => s.min(0)),
            feePct: pct(0.01, { label: 'Land loan fee' }),
          })
          .prefault({}),
        mezz: z
          .object({
            enabled: bool(false, { label: 'Mezzanine tranche' }),
            pctOfCost: pct(0.1, { label: 'Mezzanine (% of total cost)' }),
            ratePct: num(0.12, { label: 'Mezzanine rate', unit: 'rate_pct' }, (s) => s.min(0)),
            feePct: pct(0.01, { label: 'Mezzanine fee' }),
            repaidAt: z.enum(['refi', 'sale']).default('refi').meta({ label: 'Mezzanine repaid at', unit: 'text' }),
          })
          .prefault({}),
        permanent: z
          .object({
            enabled: bool(true, { label: 'Permanent refinance' }),
            monthsAfterStabilization: num(
              0,
              { label: 'Refinance months after stabilization', unit: 'months' },
              (s) => s.int().min(0),
            ),
            maxLTV: pct(0.65, { label: 'Maximum loan-to-value' }),
            minDSCR: num(1.25, { label: 'Minimum DSCR', unit: 'count' }, (s) => s.gt(0)),
            ratePct: num(0.06, { label: 'Permanent loan rate', unit: 'rate_pct', star: true }, (s) =>
              s.min(0),
            ),
            amortYears: num(30, { label: 'Amortization (years)', unit: 'count', star: true }, (s) =>
              s.int().min(1),
            ),
            ioMonths: num(0, { label: 'Interest-only months', unit: 'months' }, (s) => s.int().min(0)),
            feePct: pct(0.01, { label: 'Permanent loan fee' }),
            refiCapRatePct: num(0.055, { label: 'Refinance cap rate', unit: 'rate_pct' }, (s) =>
              s.gt(0),
            ),
          })
          .prefault({}),
        capitalizeOperatingDeficits: bool(true, {
          label: 'Capitalize lease-up operating deficits',
          help: 'When on, lease-up deficits are project costs funded in the normal order.',
        }),
      })
      .prefault({}),
    operations: z
      .object({
        stabilizedVacancyPct: pct(0.05, { label: 'Stabilized vacancy' }),
        creditLossPct: pct(0.005, { label: 'Credit loss' }),
        rentGrowthPct: num(0.03, { label: 'Rent growth (annual)', unit: 'rate_pct' }),
        expenseGrowthPct: num(0.03, { label: 'Expense growth (annual)', unit: 'rate_pct' }),
        otherIncomeGrowthPct: num(0.03, { label: 'Other income growth (annual)', unit: 'rate_pct' }),
        absorption: z
          .discriminatedUnion('kind', [
            z.object({ kind: z.literal('linear') }),
            z.object({ kind: z.literal('unitsPerMonth'), units: z.number().gt(0) }),
          ])
          .default({ kind: 'linear' }),
        opex: z
          .object({
            taxesStabilizedAnnual: num(
              180000,
              { label: 'Property taxes, stabilized (annual)', unit: 'usd', star: true, elaborable: true },
              (s) => s.min(0),
            ),
            insurancePerUnit: num(600, { label: 'Insurance', unit: 'usd_per_unit', star: true, elaborable: true }, (s) => s.min(0)),
            repairsPerUnit: num(500, { label: 'Repairs and maintenance', unit: 'usd_per_unit', star: true, elaborable: true }, (s) => s.min(0)),
            payrollPerUnit: num(1200, { label: 'Payroll', unit: 'usd_per_unit', star: true, elaborable: true }, (s) => s.min(0)),
            utilitiesPerUnit: num(500, { label: 'Utilities', unit: 'usd_per_unit', star: true, elaborable: true }, (s) => s.min(0)),
            adminPerUnit: num(300, { label: 'Administrative', unit: 'usd_per_unit', star: true, elaborable: true }, (s) => s.min(0)),
            marketingPerUnit: num(200, { label: 'Marketing', unit: 'usd_per_unit', star: true, elaborable: true }, (s) => s.min(0)),
            reservesPerUnit: num(300, { label: 'Replacement reserves', unit: 'usd_per_unit', star: true, elaborable: true }, (s) => s.min(0)),
            managementPctEGI: pct(0.03, { label: 'Management (% of EGI)', star: true }),
          })
          .prefault({}),
      })
      .prefault({}),
    exit: z
      .object({
        exitCapRatePct: num(0.055, { label: 'Exit cap rate', unit: 'rate_pct', star: true }, (s) =>
          s.gt(0),
        ),
        brokerFeePct: pct(0.02, { label: 'Broker fee (% of sale)' }),
        closingCostPct: pct(0.01, { label: 'Sale closing costs (% of sale)' }),
      })
      .prefault({}),
    equity: z
      .object({
        gpPct: pct(0.1, { label: 'GP share of equity', star: true }),
        lpPct: pct(0.9, { label: 'LP share of equity', star: true }),
        tiers: z.array(TierSchema).default(DEFAULT_TIERS),
      })
      .prefault({}),
  })
  .meta({ title: 'DealInputs', description: 'Pencil deal inputs (spec 7.2).' });

export type DealInputs = z.infer<typeof DealInputsSchema>;
/** The loosely-typed shape accepted by `parseInputs`: every field optional, defaults applied. */
export type DealInputsInput = z.input<typeof DealInputsSchema>;

/** Parse a partial deal, applying every schema default. Throws a ZodError on invalid shapes. */
export function parseInputs(raw: unknown): DealInputs {
  return DealInputsSchema.parse(raw);
}

/** The JSON Schema of DealInputs, with units, labels, defaults and `elaborable` flags. */
export function dealInputsJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(DealInputsSchema, { unrepresentable: 'any' }) as Record<string, unknown>;
}

/** One entry per leaf input: its dotted path and metadata (FR-1.3). */
export interface CatalogEntry {
  path: string;
  label: string;
  unit: Unit;
  star: boolean;
  elaborable: boolean;
  default: unknown;
  help?: string;
  /** Section of the assumptions register, taken from the first path segment. */
  section: string;
}

type AnyZod = { _zod: { def: Record<string, unknown> }; meta?: () => Record<string, unknown> | undefined };

function unwrap(schema: AnyZod): { inner: AnyZod; def: Record<string, unknown>; meta: Record<string, unknown>; defaultValue: unknown } {
  let current = schema;
  let meta: Record<string, unknown> = {};
  let defaultValue: unknown = undefined;
  for (;;) {
    const m = current.meta?.();
    if (m) meta = { ...m, ...meta };
    const def = current._zod.def;
    const type = def.type as string;
    if (type === 'default' || type === 'prefault') {
      if (defaultValue === undefined) {
        const dv = def.defaultValue;
        defaultValue = typeof dv === 'function' ? (dv as () => unknown)() : dv;
      }
      current = def.innerType as AnyZod;
      continue;
    }
    if (type === 'optional' || type === 'nullable') {
      current = def.innerType as AnyZod;
      continue;
    }
    return { inner: current, def, meta, defaultValue };
  }
}

function walk(schema: AnyZod, path: string, out: CatalogEntry[], arrayKeys?: string[]): void {
  const { inner, def, meta, defaultValue } = unwrap(schema);
  const type = def.type as string;
  if (type === 'object') {
    const shape = def.shape as Record<string, AnyZod>;
    for (const [key, child] of Object.entries(shape)) {
      walk(child, path ? `${path}.${key}` : key, out);
    }
    return;
  }
  if (type === 'array') {
    // Arrays of keyed objects (unit types, tiers, events, lines) are catalogued per element key
    // when known; the generic entry uses `[*]`.
    const element = def.element as AnyZod;
    const keys = arrayKeys ?? (path === 'program.unitTypes' ? [...UNIT_TYPE_KEYS] : undefined);
    if (keys) {
      for (const k of keys) walk(element, `${path}[${k}]`, out);
    }
    return;
  }
  if (type === 'union') {
    // Distributions and absorption kinds: catalogued as a single text input.
    if (meta.label) {
      out.push({
        path,
        label: String(meta.label),
        unit: (meta.unit as Unit) ?? 'text',
        star: Boolean(meta.star),
        elaborable: false,
        default: defaultValue,
        section: path.split('.')[0] ?? '',
      });
    }
    return;
  }
  if (!meta.label) return;
  void inner;
  out.push({
    path,
    label: String(meta.label),
    unit: (meta.unit as Unit) ?? 'text',
    star: Boolean(meta.star),
    elaborable: Boolean(meta.elaborable),
    default: defaultValue,
    ...(meta.help ? { help: String(meta.help) } : {}),
    section: path.split('.')[0] ?? '',
  });
}

let catalogCache: CatalogEntry[] | undefined;

/** Every leaf input with its path and metadata, in schema order. Unit types are expanded per key. */
export function inputCatalog(): CatalogEntry[] {
  if (!catalogCache) {
    const out: CatalogEntry[] = [];
    walk(DealInputsSchema as unknown as AnyZod, '', out);
    catalogCache = out;
  }
  return catalogCache;
}

/** The twelve "tonight" inputs (plus the per-unit-type stars that make up the mix), in order. */
export function starInputs(): CatalogEntry[] {
  return inputCatalog().filter((e) => e.star);
}

export function catalogEntry(path: string): CatalogEntry | undefined {
  return inputCatalog().find((e) => e.path === path);
}
