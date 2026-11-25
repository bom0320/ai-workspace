export { compareDecisions } from "./flow/compare-decisions.js";
export type {
  CodexComparatorOptions,
  ComparisonContext,
} from "./data-flow/input.js";
export type {
  ComparisonRelation,
  ComparisonGapKind,
  ComparisonPosition,
  ComparisonFinding,
  ComparisonGap,
} from "./model/comparison.js";
export type { ComparisonResult } from "./data-flow/output.js";
export { comparisonPayloadSchema } from "./protocol/comparison.js";
export { validateComparisonReferences } from "./flow/validation/validate-references.js";
