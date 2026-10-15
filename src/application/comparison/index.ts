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
