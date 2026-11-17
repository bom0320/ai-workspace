export { compareDecisions } from "./flow/compare-decisions.js";
export type { CodexComparatorOptions } from "./comparator/codex-comparator.js";
export type { ComparisonContext } from "./protocol/context.js";
export type {
  ComparisonRelation,
  ComparisonGapKind,
  ComparisonPosition,
  ComparisonFinding,
  ComparisonGap,
  ComparisonResult,
} from "./model/comparison.js";
export { comparisonPayloadSchema } from "./protocol/comparison.js";
export { validateComparisonReferences } from "./flow/validation/validate-references.js";

export { consumeValidatedComparison } from "./validated-result.js";
