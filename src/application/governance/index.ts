export {
  approvedOperatingScopeSchema,
  invokeSpecialistRequestSchema,
  authorizedSpecialistInvocationSchema,
  authorityVerdictSchema,
  type ApprovedAssignment,
  type ApprovedOperatingScope,
  type InvokeSpecialistRequest,
  type AuthorizedSpecialistInvocation,
  type AuthorityVerdict,
} from "./model/authority.js";

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
export {
  reserveAssignmentExecution,
  claimAssignmentExecution,
  consumeAssignmentReadContext,
} from "./authorization/features/assignment-execution/flow/authorize-assignment-execution.js";
export {
  recordAssignmentFailure,
  getAssignmentExecutionResults,
} from "./records/assignment-executions/assignment-execution-results.js";
