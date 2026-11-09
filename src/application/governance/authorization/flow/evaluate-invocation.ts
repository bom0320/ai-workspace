import { isUnambiguousRepositoryPath } from "@/services/repository-inspection/index.js";

import {
  approvedOperatingScopeSchema,
  invokeSpecialistRequestSchema,
  invocationEvaluationContextSchema,
  type InvocationEligibility,
} from "../../model/authority.js";

// Validate unique, unambiguous repository-relative paths.

function hasUnambiguousPaths(paths: string[]): boolean {
  return (
    new Set(paths).size === paths.length &&
    paths.every(isUnambiguousRepositoryPath)
  );
}

// Evaluate invocation eligibility without granting authority or reserving budget.

export function evaluateInvocationRequest(
  request: unknown,
  scope: unknown,
  evaluationContext: unknown
): InvocationEligibility {
  const denied = (reason: string): InvocationEligibility => ({
    status: "denied",
    reason,
  });

  // 1. Validate Inputs

  const parsedRequest = invokeSpecialistRequestSchema.safeParse(request);

  if (!parsedRequest.success) {
    return denied(
      "Invalid invocation request; objective and authority must come from approved sources."
    );
  }

  const parsedScope = approvedOperatingScopeSchema.safeParse(scope);

  if (!parsedScope.success) {
    return denied("Invalid approved operating scope.");
  }

  const parsedContext =
    invocationEvaluationContextSchema.safeParse(evaluationContext);

  if (!parsedContext.success) {
    return denied("Invalid Harness evaluation context or invocation usage.");
  }

  const input = parsedRequest.data;
  const approved = parsedScope.data;
  const context = parsedContext.data;

  // 2. Validate Scope Identity and Status

  if (input.scopeId !== approved.id) {
    return denied("Scope ID mismatch.");
  }

  if (input.scopeVersion !== approved.version) {
    return denied("Scope version mismatch.");
  }

  if (context.scopeStatus !== "active") {
    return denied(`Scope is ${context.scopeStatus}.`);
  }

  // 3. Validate Assignment

  const ids = approved.assignments.map(({ assignmentId }) => assignmentId);

  if (new Set(ids).size !== ids.length) {
    return denied("Duplicate approved assignment IDs.");
  }

  const assignment = approved.assignments.find(
    ({ assignmentId }) => assignmentId === input.assignmentId
  );

  if (!assignment) {
    return denied(
      "Assignment is not approved; a separate Staffing Proposal change is required."
    );
  }

  // 4. Validate Context Paths

  if (!hasUnambiguousPaths(assignment.contextPaths)) {
    return denied(
      "Approved assignment has invalid or duplicate context paths."
    );
  }

  if (!hasUnambiguousPaths(input.requestedContextPaths)) {
    return denied(
      "Requested context has invalid or duplicate repository-relative paths."
    );
  }

  const allowedPaths = new Set(assignment.contextPaths);

  const exceedsApprovedContext = input.requestedContextPaths.some(
    (path) => !allowedPaths.has(path)
  );

  if (exceedsApprovedContext) {
    return denied(
      "Requested context exceeds the approved assignment; a separate Staffing Proposal change is required."
    );
  }

  // 5. Validate Invocation Budget

  if (context.usedAgentInvocations >= approved.budget.maxAgentInvocations) {
    return denied("Invocation budget is exhausted.");
  }

  // 6. Return Eligibility

  // Eligibility does not authorize execution or reserve budget.
  // Actual authorization is handled by authorizeSpecialistInvocation().

  return {
    status: "eligible",
  };
}
