/**
 * @pencil/parcels — Massachusetts town table (cluster, residential tax rate, assessor URL, MBTA
 * Communities status) and the parcel lookup (spec 9.5). The statewide parcel dataset is not
 * loadable in this environment, so `lookupParcel` is a documented stub that returns `unknown`
 * sources; the town table is real data with approximate FY2025 rates marked for verification.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseCsvObjects } from './csv';

export { parseCsv, parseCsvObjects } from './csv';

export const TOWN_CLUSTERS = ['boston-core', 'inner-suburbs', 'outer-suburbs', 'gateway-cities', 'other-ma'] as const;
export type TownCluster = (typeof TOWN_CLUSTERS)[number];

export const TownSchema = z.object({
  town: z.string(),
  cluster: z.enum(TOWN_CLUSTERS),
  /** Residential tax rate per $1,000 of assessed value, or null when not known. */
  residentialTaxRate: z.number().nullable(),
  taxRateFiscalYear: z.string(),
  assessorUrl: z.string(),
  mbtaStatus: z.string(),
  notes: z.string(),
});
export type Town = z.infer<typeof TownSchema>;

let cache: Town[] | undefined;

export function loadTownsCsv(text: string): Town[] {
  return parseCsvObjects(text).map((r) =>
    TownSchema.parse({
      town: r.town,
      cluster: r.cluster,
      residentialTaxRate: r.residential_tax_rate ? Number(r.residential_tax_rate) : null,
      taxRateFiscalYear: r.tax_rate_fiscal_year ?? '',
      assessorUrl: r.assessor_url ?? '',
      mbtaStatus: r.mbta_status ?? '',
      notes: r.notes ?? '',
    }),
  );
}

/** The bundled Massachusetts town table. */
export function towns(): Town[] {
  if (!cache) {
    const here = dirname(fileURLToPath(import.meta.url));
    cache = loadTownsCsv(readFileSync(join(here, '..', 'data', 'towns.csv'), 'utf8'));
  }
  return cache;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function lookupTown(name: string): Town | undefined {
  const n = normalize(name);
  return towns().find((t) => normalize(t.town) === n);
}

export interface ParsedAddress {
  raw: string;
  street?: string;
  town?: string;
  state?: string;
  zip?: string;
}

/**
 * Parse "120 Highland Avenue, Needham, MA 02494" (or without the state and zip) into parts. The
 * town is matched against the town table when the comma-separated form is ambiguous.
 */
export function parseAddress(raw: string): ParsedAddress {
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const result: ParsedAddress = { raw: raw.trim() };
  if (parts.length === 0) return result;
  result.street = parts[0];
  if (parts.length >= 2) {
    result.town = parts[1];
    const tail = parts.slice(2).join(' ');
    const m = tail.match(/\b(MA|Massachusetts)\b\s*(\d{5})?/i);
    if (m) {
      result.state = 'MA';
      if (m[2]) result.zip = m[2];
    }
  } else {
    // "120 Highland Avenue Needham MA": scan for a known town name.
    const lower = raw.toLowerCase();
    const known = towns().find((t) => lower.includes(t.town.toLowerCase()));
    if (known) result.town = known.town;
  }
  // Clean a trailing state from the town part ("Needham MA").
  if (result.town) {
    const m = result.town.match(/^(.*?)\s+(MA|Massachusetts)(\s+\d{5})?$/i);
    if (m) {
      result.town = m[1]!.trim();
      result.state = 'MA';
      if (m[3]) result.zip = m[3].trim();
    }
  }
  return result;
}

export type LookupSource = 'parcel-data' | 'unknown';

export interface ParcelLookup {
  address: ParsedAddress;
  town?: Town;
  /** Parcel facts. Each carries its source: `parcel-data` when it came from the dataset, else `unknown`. */
  lotSF: { value: number | null; source: LookupSource };
  zoningDistrict: { value: string | null; source: LookupSource };
  mbtaCommunitiesDistrict: { value: boolean | null; source: LookupSource };
  assessedValue: { value: number | null; source: LookupSource };
  annualTax: { value: number | null; source: LookupSource };
  /** Back-of-envelope buildable units from the district density rule, when a rule is known. */
  envelope: { unitsByRight: number | null; rule: string | null };
  lookupDate: string;
  notes: string[];
}

export interface ParcelDataset {
  find(address: ParsedAddress): Partial<Pick<ParcelLookup, 'lotSF' | 'zoningDistrict' | 'mbtaCommunitiesDistrict' | 'assessedValue' | 'annualTax'>> & { envelope?: ParcelLookup['envelope'] };
}

/**
 * Look up a parcel by address. Without a dataset (the default in this environment) the fields are
 * left empty with source `unknown` and the deal still proceeds (spec 5 step 1, 9.5). The town
 * table still supplies the cluster, the tax rate and the MBTA Communities status.
 */
export function lookupParcel(raw: string, opts: { dataset?: ParcelDataset; today?: string } = {}): ParcelLookup {
  const address = parseAddress(raw);
  const town = address.town ? lookupTown(address.town) : undefined;
  const unknown = <T>(): { value: T | null; source: LookupSource } => ({ value: null, source: 'unknown' });
  const result: ParcelLookup = {
    address,
    ...(town ? { town } : {}),
    lotSF: unknown<number>(),
    zoningDistrict: unknown<string>(),
    mbtaCommunitiesDistrict: unknown<boolean>(),
    assessedValue: unknown<number>(),
    annualTax: unknown<number>(),
    envelope: { unitsByRight: null, rule: null },
    lookupDate: opts.today ?? new Date().toISOString().slice(0, 10),
    notes: [],
  };
  if (!town) result.notes.push(address.town ? `Town "${address.town}" is not in the Massachusetts town table.` : 'No town could be read from the address.');
  if (opts.dataset) {
    const found = opts.dataset.find(address);
    Object.assign(result, found);
  } else {
    result.notes.push('Statewide parcel data is not loaded in this environment; lot area, zoning, assessed value and current tax are left empty with source "unknown".');
  }
  if (town && result.mbtaCommunitiesDistrict.value === null && town.mbtaStatus && !/not an MBTA|n\/a/i.test(town.mbtaStatus)) {
    // The town is an MBTA community; whether the parcel lies in the designated district is unknown.
    result.notes.push(`${town.town} is an MBTA community (${town.mbtaStatus}); whether this parcel sits in the designated multifamily district is not known without parcel data.`);
  }
  return result;
}

/**
 * Default stabilized property tax: town rate per $1,000 × assessment ratio × stabilized value
 * (14.2 default: 85% of value). Returns null when the town rate is unknown.
 */
export function defaultStabilizedTax(town: Town | undefined, stabilizedValue: number, assessmentRatio = 0.85): number | null {
  if (!town || town.residentialTaxRate === null) return null;
  return (town.residentialTaxRate / 1000) * assessmentRatio * stabilizedValue;
}
