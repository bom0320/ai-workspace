import {
  getApprovedStaffingScope,
  authorizeSpecialistInvocation,
  invokeSpecialistRequestSchema,
  type ApprovedOperatingScope,
  type AuthorizedSpecialistInvocation,
  type InvokeSpecialistRequest,
} from "@/application/governance/index.js";
import type { AgentDecision } from "@/application/decision/index.js";
import {
  compareDecisions,
  type ComparisonResult,
} from "@/application/comparison/index.js";
import {
  runAuthorizedSpecialistDecision,
  InvocationClaimError,
} from "./authorized-specialist-decision.js";

export type SpecialistDecisionsWorkflowInput = {
  scopeId: string;
  requests: InvokeSpecialistRequest[];
};

export type SpecialistDecisionsWorkflowResult =
  | {
      status: "completed";
      decisions: AgentDecision[];
      comparison?: ComparisonResult;
    }
  | {
      status: "failed";
      stage:
        "preflight" | "authorization" | "claim" | "decision" | "comparison";
      reason: string;
      assignmentId?: string;
    };

export async function runSpecialistDecisions(
  input: SpecialistDecisionsWorkflowInput
): Promise<SpecialistDecisionsWorkflowResult> {
  // 1. Validate Approved Scope and Requests
  // Invalid batches must not consume budget; detach every request before awaiting.
  const preflight = preflightSpecialistDecisions(input);
  if (preflight.status === "failed") return preflight;
  const { scope, requests } = preflight;

  // 2. Authorize and Execute Specialists
  const decisions: AgentDecision[] = [];
  // A failed batch yields no partial success, so avoid consuming later budgets.
  // Governance owns per-request authority, Context and budget policy.
  for (const request of requests) {
    let invocation: AuthorizedSpecialistInvocation;
    try {
      const verdict = authorizeSpecialistInvocation(request);
      if (verdict.status !== "allowed") throw new Error(verdict.reason);
      invocation = verdict.invocation;
    } catch (error) {
      return {
        status: "failed",
        stage: "authorization",
        reason: failureReason(error),
        assignmentId: request.assignmentId,
      };
    }
    try {
      decisions.push(await runAuthorizedSpecialistDecision(invocation));
    } catch (error) {
      return {
        status: "failed",
        stage: error instanceof InvocationClaimError ? "claim" : "decision",
        reason: failureReason(error),
        assignmentId: request.assignmentId,
      };
    }
  }
  // 3. Compare Collected Decisions
  // Only a complete batch is a valid Comparison unit; failures return no partial result.
  if (decisions.length === 1) return { status: "completed", decisions };
  try {
    const comparison = await compareDecisions({
      goal: scope.goal,
      repositoryCommitSha: scope.snapshot.commitSha,
      decisions,
    });
    return { status: "completed", decisions, comparison };
  } catch (error) {
    return {
      status: "failed",
      stage: "comparison",
      reason: failureReason(error),
    };
  }
}

function preflightSpecialistDecisions(input: SpecialistDecisionsWorkflowInput):
  | {
      status: "ready";
      scope: ApprovedOperatingScope;
      requests: InvokeSpecialistRequest[];
    }
  | Extract<SpecialistDecisionsWorkflowResult, { status: "failed" }> {
  let assignmentId: string | undefined;
  try {
    // 1. Validate Input Shape
    if (
      !input ||
      typeof input.scopeId !== "string" ||
      !input.scopeId.trim() ||
      !Array.isArray(input.requests) ||
      input.requests.length === 0
    )
      throw new Error(
        "A Scope ID and non-empty Assignment request list are required."
      );
    // 2. Load Approved Scope
    const approved = getApprovedStaffingScope(input.scopeId);
    if (approved.status !== "approved")
      throw new Error(
        "reason" in approved ? approved.reason : "Approved Scope unavailable."
      );
    const scope = approved.scope;
    // 3. Validate and Detach All Requests
    const assignmentIds = new Set<string>();
    const specialistIds = new Set<string>();
    // Array.from visits sparse slots so missing requests fail validation too.
    const requests = Array.from(input.requests, (raw) => {
      assignmentId =
        typeof raw?.assignmentId === "string" ? raw.assignmentId : undefined;
      const request = invokeSpecialistRequestSchema.parse(raw);
      if (
        request.scopeId !== scope.id ||
        request.scopeVersion !== scope.version
      )
        throw new Error(
          "Requests must use the same approved Scope ID and version."
        );
      const assignment = scope.assignments.find(
        (item) => item.assignmentId === request.assignmentId
      );
      if (!assignment)
        throw new Error("Assignment does not belong to the approved Scope.");
      if (
        assignmentIds.has(assignment.assignmentId) ||
        specialistIds.has(assignment.specialistId)
      )
        throw new Error(
          "Duplicate Assignment or Specialist in Decision requests."
        );
      assignmentIds.add(assignment.assignmentId);
      specialistIds.add(assignment.specialistId);
      return request;
    });
    return { status: "ready", scope, requests };
  } catch (error) {
    return {
      status: "failed",
      stage: "preflight",
      reason: failureReason(error),
      ...(assignmentId !== undefined ? { assignmentId } : {}),
    };
  }
}

function failureReason(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Specialist Decision Workflow failed.";
}
