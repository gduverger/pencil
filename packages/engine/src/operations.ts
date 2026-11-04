/**
 * Lease-up and operations (7.7). Filled in milestone M2; M1 produces a zero operating series so
 * the funding order and fixed point can be verified on their own.
 */
import type { DealInputs } from './schema';
import type { Timeline } from './timeline';
import type { OpexLine, ProgramSummary } from './types';
import { OPEX_LINES } from './types';
import { zeros } from './math';

export interface OperationsSeries {
  /** Length S + 13: months 0..S plus the twelve forward months used for valuation. */
  length: number;
  gpr: number[];
  occupancy: number[];
  vacancyAndCreditLoss: number[];
  otherIncome: number[];
  commercialIncome: number[];
  egi: number[];
  opex: Record<OpexLine, number[]>;
  opexTotal: number[];
  noi: number[];
}

export function emptyOperations(length: number): OperationsSeries {
  const opex = {} as Record<OpexLine, number[]>;
  for (const l of OPEX_LINES) opex[l] = zeros(length);
  return {
    length,
    gpr: zeros(length),
    occupancy: zeros(length),
    vacancyAndCreditLoss: zeros(length),
    otherIncome: zeros(length),
    commercialIncome: zeros(length),
    egi: zeros(length),
    opex,
    opexTotal: zeros(length),
    noi: zeros(length),
  };
}

export function computeOperations(inputs: DealInputs, program: ProgramSummary, tl: Timeline): OperationsSeries {
  void inputs;
  void program;
  return emptyOperations(tl.S + 13);
}
