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
export {
  runScenario,
  runScenarios,
  sensitivity,
  sensitivityPresets,
  scenarioOverridesFromDeltas,
  DEFAULT_SCENARIO_DELTAS,
  SCENARIO_KEYS,
} from './scenarios';
export type { ScenarioKey, ScenarioSet, Overrides, Axis, Grid, GridCell, SensitivityPreset, ScenarioDeltas } from './scenarios';
export { residualLandValue } from './residual';
export type { ResidualLandValue } from './residual';
export { explain, explainableCells } from './explain';
export type { ExplainTrace, Operand } from './explain';
export { amortize, sizePermanentLoan } from './permanent';
export { computeOperations, occupancyAt, commercialOccupancyAt } from './operations';
export type { OperationsSeries } from './operations';
export { runWaterfall } from './waterfall';
export type { WaterfallInput, WaterfallResult } from './waterfall';
export { buildAnnual } from './annual';
export { computeMetrics, metricSeries } from './metrics';
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
