import { isUnambiguousRepositoryPath } from "@/services/repository-inspection/index.js";

import {
  approvedOperatingScopeSchema,
  invokeSpecialistRequestSchema,
  invocationEvaluationContextSchema,
  type InvocationEligibility,
} from "../model/authority.js";

// Governance accepts only unambiguous repository-relative file spellings.
// This also rejects every unsafe form rejected by Decision's private loader,
// without importing its file-reading use-case or changing v2 path semantics.
function hasUnambiguousPaths(paths: string[]): boolean {
  return new Set(paths).size === paths.length && paths.every(isUnambiguousRepositoryPath);
}

/** Pure point-in-time evaluation. Inputs must be supplied by the Harness;
 * this function does not authenticate their provenance or reserve budget.
 * Invalid boundary data is denied, including extra CEO-controlled fields.
 */
export function evaluateInvocationRequest(
  request: unknown,
  scope: unknown,
  evaluationContext: unknown,
): InvocationEligibility {
  const denied = (reason: string): InvocationEligibility => ({ status: "denied", reason });
  const parsedRequest = invokeSpecialistRequestSchema.safeParse(request);
  if (!parsedRequest.success) return denied("Invalid invocation request; objective and authority must come from approved sources.");
  const parsedScope = approvedOperatingScopeSchema.safeParse(scope);
  if (!parsedScope.success) return denied("Invalid approved operating scope.");
  const parsedContext = invocationEvaluationContextSchema.safeParse(evaluationContext);
  if (!parsedContext.success) return denied("Invalid Harness evaluation context or invocation usage.");

  const input = parsedRequest.data;
  const approved = parsedScope.data;
  const context = parsedContext.data;
  if (input.scopeId !== approved.id) return denied("Scope ID mismatch.");
  if (input.scopeVersion !== approved.version) return denied("Scope version mismatch.");
  if (context.scopeStatus !== "active") return denied(`Scope is ${context.scopeStatus}.`);

  const ids = approved.assignments.map(({ assignmentId }) => assignmentId);
  if (new Set(ids).size !== ids.length) return denied("Duplicate approved assignment IDs.");
  const assignment = approved.assignments.find(({ assignmentId }) => assignmentId === input.assignmentId);
  if (!assignment) return denied("Assignment is not approved; a separate Staffing Proposal change is required.");
  if (!hasUnambiguousPaths(assignment.contextPaths)) return denied("Approved assignment has invalid or duplicate context paths.");
  if (!hasUnambiguousPaths(input.requestedContextPaths)) return denied("Requested context has invalid or duplicate repository-relative paths.");
  const allowedPaths = new Set(assignment.contextPaths);
  if (input.requestedContextPaths.some((path) => !allowedPaths.has(path))) {
    return denied("Requested context exceeds the approved assignment; a separate Staffing Proposal change is required.");
  }
  if (context.usedAgentInvocations >= approved.budget.maxAgentInvocations) return denied("Invocation budget is exhausted.");

  // No policy input establishes whether expansion can be approved. Never infer
  // reapproval eligibility, construct an invocation, or consume budget here.
  return { status: "eligible" };
}
