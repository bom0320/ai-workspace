export type { ExecutionHandoffApproval } from "./data-flow/handoff/input.js";
export type { VerifiedPhaseBContext } from "./data-flow/handoff/output.js";
export {
  approvedOperatingScopeSchema,
  authorizedSpecialistInvocationSchema,
  type ApprovedAssignment,
  type ApprovedOperatingScope,
  type AuthorizedSpecialistInvocation,
} from "./model/authority.js";
export {
  invokeSpecialistRequestSchema,
  type InvokeSpecialistRequest,
} from "./data-flow/specialist-invocation/input.js";
export {
  authorityVerdictSchema,
  type AuthorityVerdict,
} from "./data-flow/specialist-invocation/output.js";

export {
  invocationEvaluationContextSchema,
  invocationEligibilitySchema,
  type InvocationEvaluationContext,
  type InvocationEligibility,
} from "./model/authority.js";
export * from "./approval/index.js";
export * from "./authorization/index.js";
export { getAssignmentPlanContext } from "./records/assignment-plans/prepare-assignment-context.js";
export {
  AssignmentRegistrationError,
  getPreparedAssignmentPlan,
  registerAssignmentPlan,
} from "./records/assignment-plans/assignment-plan-records.js";

export {
  AssignmentExecutionError,
  assignmentExecutionRequestSchema,
  authorizedAssignmentExecutionSchema,
  type AssignmentExecutionRequest,
  type AuthorizedAssignmentExecution,
} from "./model/assignment-execution.js";
export { reserveAssignmentExecution } from "./authorization/features/assignment-execution/flow/reservation/reserve-assignment-execution.js";
export { claimAssignmentExecution } from "./authorization/features/assignment-execution/flow/claim/claim-assignment-execution.js";
export {
  consumeAssignmentReadContext,
  type AssignmentReadSession,
} from "./authorization/features/assignment-execution/flow/read-session/consume-assignment-read-context.js";
export {
  consumeAssignmentWriteExecution,
  takeAssignmentTaskExecution,
} from "./authorization/features/assignment-execution/flow/write-execution/consume-assignment-write-execution.js";
export {
  recordAssignmentFailure,
  getAssignmentExecutionResults,
} from "./records/assignment-executions/assignment-execution-results.js";
