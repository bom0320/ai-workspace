import {
  authorizeSpecialistInvocation,
  type AuthorizedSpecialistInvocation,
} from "@/application/governance/index.js";
import type { AgentDecision } from "@/application/decision/index.js";
import {
  compareDecisions,
  type ComparisonResult,
} from "@/application/comparison/index.js";
import {
  runAuthorizedSpecialistDecision,
  InvocationClaimError,
} from "./execution/authorized-specialist-decision.js";

import {
  preflightSpecialistDecisions,
  type SpecialistDecisionsWorkflowInput,
} from "./validation/preflight-specialist-decisions.js";

export type { SpecialistDecisionsWorkflowInput } from "./validation/preflight-specialist-decisions.js";

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

function failureReason(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Specialist Decision Workflow failed.";
}
