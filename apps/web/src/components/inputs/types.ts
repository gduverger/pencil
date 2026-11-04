import type { DealState, SwitchDefinition } from '@pencil/db/state';
import type { CatalogEntry, ScenarioKey } from '@pencil/engine';

export interface BenchmarkInfo {
  id: string;
  low: number;
  mid: number;
  high: number;
  asOf: string;
  source: string;
  sampleSize: number | null;
}

export interface InputsScreenProps {
  dealId: string;
  dealName: string;
  rev: number;
  state: DealState;
  catalog: CatalogEntry[];
  benchmarks: Record<string, BenchmarkInfo>;
  switches: SwitchDefinition[];
  userId: string;
}

export type Scenario = ScenarioKey;
