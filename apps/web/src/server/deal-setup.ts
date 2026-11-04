/**
 * New-from-address (spec 5 step 1): parse the address, look up the town and parcel, pick the
 * benchmark segment, resolve every default and build the initial deal state. Looked-up parcel
 * facts become inputs with source `parcel-data`; missing ones stay empty with source `unknown`.
 */
import { lookupParcel, defaultStabilizedTax, type ParcelLookup } from '@pencil/parcels';
import { projectSizeOf, resolveDefaults, type Benchmark, type ConstructionType, type Segment } from '@pencil/benchmarks';
import { newDealState, type DealSetup, type DealState, type DefaultedInput } from '@pencil/db';
import { run } from '@pencil/engine';

export interface SetupRequest {
  name?: string;
  address: string;
  constructionType: ConstructionType;
  totalUnits?: number;
  landOwned?: boolean;
  landCost?: number;
}

export interface SetupResult {
  name: string;
  state: DealState;
  lookup: ParcelLookup;
  segment: Segment;
}

export function setupFromLookup(lookup: ParcelLookup, constructionType: ConstructionType): DealSetup {
  return {
    constructionType,
    townCluster: lookup.town?.cluster ?? null,
    town: lookup.town?.town ?? lookup.address.town ?? null,
    address: lookup.address.raw,
    parcel: {
      lotSF: lookup.lotSF.value,
      zoningDistrict: lookup.zoningDistrict.value,
      mbtaCommunitiesDistrict: lookup.mbtaCommunitiesDistrict.value,
      assessedValue: lookup.assessedValue.value,
      annualTax: lookup.annualTax.value,
      unitsByRight: lookup.envelope.unitsByRight,
      lookupDate: lookup.lookupDate,
      notes: lookup.notes,
    },
  };
}

export function buildNewDeal(req: SetupRequest, benchmarks: readonly Benchmark[], actor: string, now: string): SetupResult {
  const lookup = lookupParcel(req.address, { today: now.slice(0, 10) });
  const totalUnits = req.totalUnits ?? (lookup.envelope.unitsByRight ?? 60);
  const segment: Segment = { constructionType: req.constructionType, projectSize: projectSizeOf(totalUnits), ...(lookup.town ? { townCluster: lookup.town.cluster } : {}) };
  const defaults = resolveDefaults(benchmarks, segment);
  const name = req.name?.trim() || (lookup.address.street ? `${lookup.address.street}${lookup.town ? `, ${lookup.town.town}` : ''}` : req.address.trim() || 'Untitled deal');
  const overrides: Record<string, DefaultedInput> = {
    'meta.name': { path: 'meta.name', value: name, source: 'my-number', note: '', benchmarkId: null },
    'program.totalUnits': { path: 'program.totalUnits', value: totalUnits, source: req.totalUnits !== undefined ? 'my-number' : lookup.envelope.unitsByRight !== null ? 'parcel-data' : 'unknown', note: req.totalUnits !== undefined ? '' : lookup.envelope.unitsByRight !== null ? `By-right envelope: ${lookup.envelope.rule}` : 'Placeholder until the program is set', benchmarkId: null },
  };
  if (req.landOwned !== undefined) overrides['site.landOwned'] = { path: 'site.landOwned', value: req.landOwned, source: 'my-number', note: '', benchmarkId: null };
  if (req.landCost !== undefined) overrides['site.landCost'] = { path: 'site.landCost', value: req.landCost, source: 'my-number', note: '', benchmarkId: null };
  const parcelDate = `Parcel lookup ${lookup.lookupDate}`;
  if (lookup.lotSF.value !== null) overrides['site.lotSF'] = { path: 'site.lotSF', value: lookup.lotSF.value, source: 'parcel-data', note: parcelDate, benchmarkId: null };
  else overrides['site.lotSF'] = { path: 'site.lotSF', value: 0, source: 'unknown', note: 'Parcel lookup returned no lot area', benchmarkId: null };
  if (lookup.zoningDistrict.value !== null) overrides['site.zoningDistrict'] = { path: 'site.zoningDistrict', value: lookup.zoningDistrict.value, source: 'parcel-data', note: parcelDate, benchmarkId: null };
  if (lookup.mbtaCommunitiesDistrict.value !== null) overrides['site.mbtaCommunitiesDistrict'] = { path: 'site.mbtaCommunitiesDistrict', value: lookup.mbtaCommunitiesDistrict.value, source: 'parcel-data', note: parcelDate, benchmarkId: null };
  if (lookup.town?.residentialTaxRate !== null && lookup.town?.residentialTaxRate !== undefined) {
    // Stabilized taxes default from the town rate on 85% of an estimated stabilized value (14.2). The
    // estimate is one engine run at the resolved defaults, so the number is the engine's, not ours.
    const probe = newDealState(defaults, setupFromLookup(lookup, req.constructionType), actor, now, overrides);
    try {
      const outputs = run(toInputsForProbe(probe));
      const tax = defaultStabilizedTax(lookup.town, outputs.sale.value);
      if (tax !== null && Number.isFinite(tax)) {
        overrides['operations.opex.taxesStabilizedAnnual'] = { path: 'operations.opex.taxesStabilizedAnnual', value: tax, source: 'parcel-data', note: `${lookup.town.town} residential rate ${lookup.town.residentialTaxRate}/1,000 (${lookup.town.taxRateFiscalYear}, ${lookup.town.notes}) × 85% assessment ratio × estimated stabilized value`, benchmarkId: null };
      }
    } catch {
      /* keep the schema default */
    }
  }
  const state = newDealState(defaults, setupFromLookup(lookup, req.constructionType), actor, now, overrides);
  return { name, state, lookup, segment };
}

// The probe needs engine inputs from a state; imported lazily to keep this module's dependency on the state helpers explicit.
import { toDealInputs } from '@pencil/db';
function toInputsForProbe(state: DealState) {
  return toDealInputs(state, 'likely');
}
