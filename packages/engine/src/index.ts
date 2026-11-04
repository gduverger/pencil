// @pencil/engine — pure, deterministic calculation engine (spec section 7).
export { ENGINE_VERSION } from './version';
export { EngineError } from './errors';
export {
  DealInputsSchema,
  DistributionSchema,
  CostLineSchema,
  UnitTypeSchema,
  EventSchema,
  TierSchema,
  DEFAULT_TIERS,
  UNITS,
  SOURCES,
  UNIT_TYPE_KEYS,
  EVENT_KINDS,
  EVENT_CATEGORIES,
  parseInputs,
  dealInputsJsonSchema,
  inputCatalog,
  starInputs,
  catalogEntry,
} from './schema';
export type {
  DealInputs,
  DealInputsInput,
  Distribution,
  CostLine,
  UnitType,
  UnitTypeKey,
  DealEvent,
  Tier,
  Unit,
  Source,
  InputMeta,
  CatalogEntry,
} from './schema';
export * from './types';
export { run } from './run';
export { validate, validateParsed, hasErrors } from './validate';
export { checkInvariants, assertInvariants } from './invariants';
export type { InvariantViolation } from './invariants';
export { buildTimeline, phaseAt } from './timeline';
export type { Timeline } from './timeline';
export { computeProgram, gprAt, otherIncomeAt } from './program';
export { buildCostSchedule, softDefaultSchedule, spread } from './costs';
export type { CostSchedule, ScheduledLine } from './costs';
export { solveFunding } from './funding';
export type { FundingResult, FundingMonth } from './funding';
export {
  growth,
  scurveWeights,
  straightWeights,
  customWeights,
  distributionWeights,
  largestRemainder,
  irrMonthly,
  irrAnnual,
  npv,
  levelPayment,
  annuityFactor,
  sum,
  sumRange,
} from './math';
export { getPath, setPath, applyOverrides, parsePath } from './paths';
export type { Path, PathSegment } from './paths';
