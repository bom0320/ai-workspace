export { decomposeApprovedWork } from "./flow/run-work-decomposition.js";
export {
  workDecompositionResultSchema,
  type WorkDecompositionResult,
} from "./data-flow/output.js";
export { validateWorkItemSources } from "./flow/validation/validate-work-item-sources.js";
export type {
  CEOWorkDecompositionAgent,
  WorkDecompositionContext,
} from "./protocol/ceo.js";
export {
  type ApprovedWorkDecompositionInput,
  type RunWorkDecompositionOptions,
} from "./data-flow/input.js";
