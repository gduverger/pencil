/** Props for the package pages: engine outputs plus Version metadata (spec section 8). */
import type { DealOutputs, Grid, ScenarioKey, Source, Unit } from '@pencil/engine';

export interface Letterhead {
  orgName: string;
  address?: string;
  /** PNG/JPEG/SVG as a data URL or an absolute URL reachable by the renderer. */
  imageUrl?: string;
}

export interface VersionMeta {
  dealName: string;
  versionNumber: number;
  /** ISO date (YYYY-MM-DD) the Version was created. */
  versionDate: string;
  engineVersion: string;
  preparedBy?: string;
  /** "Reviewed by <firm>" line on the cover when the Version carries the reviewed flag (FR-10.3). */
  reviewedBy?: string;
}

export interface BenchmarkRange {
  low: number;
  mid: number;
  high: number;
  asOf: string;
  source: string;
  sampleSize?: number;
}

export interface RegisterEntry {
  path: string;
  section: string;
  label: string;
  unit: Unit;
  value: unknown;
  source: Source | string;
  note?: string;
  updatedAt?: string;
  updatedBy?: string;
  benchmark?: BenchmarkRange;
  /** Flag message when the value is outside its benchmark range. */
  flag?: string;
  overrides?: { best?: unknown; worst?: unknown };
}

export interface SensitivityEntry {
  key: string;
  label: string;
  grid: Grid;
  stale: boolean;
  scenario: ScenarioKey;
}

export const PAGE_KEYS = [
  'summary',
  'returns',
  'sourcesUses',
  'capitalBudget',
  'annualCashFlow',
  'saleAnalysis',
  'sensitivities',
  'assumptions',
  'appendix',
] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export const PAGE_TITLES: Record<PageKey, string> = {
  summary: 'Summary',
  returns: 'Returns',
  sourcesUses: 'Sources & uses',
  capitalBudget: 'Capital budget',
  annualCashFlow: 'Annual cash flow',
  saleAnalysis: 'Sale analysis',
  sensitivities: 'Sensitivities',
  assumptions: 'Assumptions register',
  appendix: 'Appendix',
};

export interface PackageSettings {
  pages: Record<PageKey, boolean>;
  /** The scenario whose detail pages are shown; the summary and returns pages always show all three. */
  scenario: ScenarioKey;
  includeMonthlyAppendix: boolean;
  narrative?: string;
  /** True while the narrative is the assistant's draft and the user has not edited it (10.5). */
  narrativeDrafted?: boolean;
  coverNote?: string;
}

export const DEFAULT_PACKAGE_SETTINGS: PackageSettings = {
  pages: {
    summary: true,
    returns: true,
    sourcesUses: true,
    capitalBudget: true,
    annualCashFlow: true,
    saleAnalysis: true,
    sensitivities: true,
    assumptions: true,
    appendix: true,
  },
  scenario: 'likely',
  includeMonthlyAppendix: false,
};

export interface SiteFacts {
  address?: string;
  town?: string;
  lotSF?: number;
  zoningDistrict?: string;
  mbtaCommunitiesDistrict?: boolean;
  assessedValue?: number;
  annualTax?: number;
  townCluster?: string;
}

export interface PackageProps {
  outputs: Record<ScenarioKey, DealOutputs>;
  /** Benchmark flags (9.4) from the register, counted on the Returns page beside the engine's flags. */
  benchmarkFlags?: Array<{ path: string; message: string }>;
  version: VersionMeta;
  letterhead?: Letterhead;
  register: RegisterEntry[];
  sensitivities: SensitivityEntry[];
  settings: PackageSettings;
  site?: SiteFacts;
}
