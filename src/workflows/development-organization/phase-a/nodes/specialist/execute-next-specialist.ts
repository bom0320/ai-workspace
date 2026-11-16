import {
  authorizeSpecialistInvocation,
  type AuthorizedSpecialistInvocation,
} from "@/application/governance/index.js";
import {
  runAuthorizedSpecialistDecision,
  InvocationClaimError,
} from "../../execution/authorized-specialist-decision.js";
import type { PhaseAState } from "../../state.js";

export async function executeNextSpecialist(
  state: PhaseAState
): Promise<Partial<PhaseAState>> {
  // 1. Select the Next Prepared Assignment
  const index = state.currentSpecialistIndex ?? 0;
  const request = state.preparedSpecialistRequests?.[index];
  if (!request) {
    return {
      collectedDecisions: [],
      specialistDecisionsResult: {
        status: "failed",
        stage: "preflight",
        reason: "No prepared Specialist request is available.",
      },
    };
  }

  // 2. Authorize One Invocation
  // Authority and budget remain Governance decisions. Never persist an Invocation
  // in Graph State or retry a Reservation/Claim as part of this Node.
  let invocation: AuthorizedSpecialistInvocation;
  try {
    const verdict = authorizeSpecialistInvocation(request);
    if (verdict.status !== "allowed") throw new Error(verdict.reason);
    invocation = verdict.invocation;
  } catch (error) {
    return {
      collectedDecisions: [],
      specialistDecisionsResult: {
        status: "failed",
        stage: "authorization",
        reason:
          error instanceof Error
            ? error.message
            : "Specialist Decision Workflow failed.",
        assignmentId: request.assignmentId,
      },
    };
  }

  // 3. Claim and Execute One Specialist Decision
  // The Edge, not this Node, decides whether another Assignment may execute.
  // Failed batches expose no partial success and must not consume later budgets.
  try {
    const decision = await runAuthorizedSpecialistDecision(invocation);
    return {
      collectedDecisions: [...(state.collectedDecisions ?? []), decision],
      currentSpecialistIndex: index + 1,
    };
  } catch (error) {
    return {
      collectedDecisions: [],
      specialistDecisionsResult: {
        status: "failed",
        stage: error instanceof InvocationClaimError ? "claim" : "decision",
        reason:
          error instanceof Error
            ? error.message
            : "Specialist Decision Workflow failed.",
        assignmentId: request.assignmentId,
      },
    };
  }
}
