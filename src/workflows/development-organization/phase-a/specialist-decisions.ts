import {
  getApprovedStaffingScope,
  authorizeSpecialistInvocation,
  invokeSpecialistRequestSchema,
  type ApprovedOperatingScope,
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
  let scope: ApprovedOperatingScope;
  let requests: InvokeSpecialistRequest[];
  let assignmentId: string | undefined;
  try {
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
    const approved = getApprovedStaffingScope(input.scopeId);
    if (approved.status !== "approved")
      throw new Error(
        "reason" in approved ? approved.reason : "Approved Scope unavailable."
      );
    scope = approved.scope;
    const assignments = new Set<string>();
    const specialists = new Set<string>();
    // Parse and detach every request before any reservation or asynchronous work.
    requests = Array.from(input.requests, (raw) => {
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
        assignments.has(assignment.assignmentId) ||
        specialists.has(assignment.specialistId)
      )
        throw new Error(
          "Duplicate Assignment or Specialist in Decision requests."
        );
      assignments.add(assignment.assignmentId);
      specialists.add(assignment.specialistId);
      return request;
    });
  } catch (error) {
    return {
      status: "failed",
      stage: "preflight",
      reason: reason(error),
      ...(assignmentId !== undefined ? { assignmentId } : {}),
    };
  }

  const decisions: AgentDecision[] = [];
  for (const request of requests) {
    let invocation;
    try {
      const verdict = authorizeSpecialistInvocation(request);
      if (verdict.status !== "allowed") throw new Error(verdict.reason);
      invocation = verdict.invocation;
    } catch (error) {
      return {
        status: "failed",
        stage: "authorization",
        reason: reason(error),
        assignmentId: request.assignmentId,
      };
    }
    try {
      decisions.push(await runAuthorizedSpecialistDecision(invocation));
    } catch (error) {
      return {
        status: "failed",
        stage: error instanceof InvocationClaimError ? "claim" : "decision",
        reason: reason(error),
        assignmentId: request.assignmentId,
      };
    }
  }
  if (decisions.length === 1) return { status: "completed", decisions };
  try {
    const comparison = await compareDecisions({
      goal: scope.goal,
      repositoryCommitSha: scope.snapshot.commitSha,
      decisions,
    });
    return { status: "completed", decisions, comparison };
  } catch (error) {
    return { status: "failed", stage: "comparison", reason: reason(error) };
  }
}

function reason(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Specialist Decision Workflow failed.";
}
