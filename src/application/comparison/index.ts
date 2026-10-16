export type {
  ComparisonRelation,
  ComparisonGapKind,
  ComparisonPosition,
  ComparisonFinding,
  ComparisonGap,
  ComparisonResult,
} from "./model/comparison.js";
export type { ComparisonContext } from "./protocol/context.js";
export {
  comparisonPayloadSchema,
  type ComparisonPayload,
} from "./protocol/comparison.js";
export { validateComparisonReferences } from "./flow/validation/validate-references.js";
export {
  runCodexComparator,
  type CodexComparatorOptions,
} from "./comparator/codex-comparator.js";
export { compareDecisions } from "./flow/compare-decisions.js";
export {
  runDecisionComparison,
  type RunDecisionComparisonResult,
} from "./flow/run-decision-comparison.js";
