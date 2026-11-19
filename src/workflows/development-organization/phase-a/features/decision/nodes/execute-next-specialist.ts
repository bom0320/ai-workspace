import {
  authorizeSpecialistInvocation,
  type AuthorizedSpecialistInvocation,
} from "@/application/governance/index.js";
import {
  runAuthorizedSpecialistDecision,
  InvocationClaimError,
} from "../execution/authorized-specialist-decision.js";
import type { PhaseAState } from "../../../state.js";
import { recordAnalysisDecision } from "@/application/governance/records/analysis/record-analysis-decision.js";

export async function executeNextSpecialist(
  state: PhaseAState,
  trackAnalysis = false
): Promise<Partial<PhaseAState>> {
  // 1. Require Consistent Prepared Progress Before Reserving Budget
  const requests = state.preparedSpecialistRequests;
  const index = state.currentSpecialistIndex;
  const collected = state.collectedDecisions;
  if (
    !requests?.length ||
    index === undefined ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= requests.length ||
    !collected ||
    collected.length !== index ||
    !requests[index] ||
    state.specialistDecisionsResult !== undefined
  ) {
    return {
      collectedDecisions: [],
      specialistDecisionsResult: {
        status: "failed",
        stage: "decision",
        reason:
          "Specialist execution requires consistent unfinished batch progress.",
      },
    };
  }
  const request = requests[index];

  // 2. Authorize One Invocation
  // Authority and budget remain Governance decisions. Never persist an Invocation
  // in Graph State or retry a Reservation/Claim as part of this Node.
  let invocation: AuthorizedSpecialistInvocation;
  try {
    const round = state.analysisRefinement;
    const verdict =
      round?.status === "ready"
        ? authorizeSpecialistInvocation(request, undefined, round.id)
        : authorizeSpecialistInvocation(request);
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
    if (trackAnalysis) recordAnalysisDecision(invocation, decision);
    // 4. Record Progress or Complete Stage 3 With the Last Successful Execution
    const decisions = [...collected, decision];
    const nextIndex = index + 1;
    const invocationIds = [
      ...(state.analysisBatchInvocationIds ?? []),
      invocation.invocationId,
    ];
    if (
      decisions.length === 0 ||
      decisions.length !== nextIndex ||
      nextIndex > requests.length
    )
      throw new Error("Specialist Decision batch progress is inconsistent.");
    if (nextIndex < requests.length)
      return {
        collectedDecisions: decisions,
        currentSpecialistIndex: nextIndex,
        ...(trackAnalysis && { analysisBatchInvocationIds: invocationIds }),
      };

    if (decisions.length !== requests.length)
      throw new Error(
        "Specialist Decisions require every prepared Assignment to succeed."
      );
    // Completion remains observable before Comparison without a separate Node.
    // It does not approve a direction or complete Phase A.
    const representatives = new Map(
      state.analysisRepresentatives?.map((item) => [
        item.decision.specialistId,
        item,
      ])
    );
    if (trackAnalysis) {
      for (const [position, value] of decisions.entries()) {
        const assignment = state.synthesisAssignments?.[position];
        if (
          !assignment ||
          assignment.specialistId !== value.specialistId ||
          !invocationIds[position]
        )
          throw new Error(
            "Analysis result does not match the prepared Assignment."
          );
        representatives.set(value.specialistId, {
          decision: value,
          assignment,
          invocationId: invocationIds[position],
        });
      }
    }
    const analysisRepresentatives = [...representatives.values()];
    return {
      collectedDecisions: decisions,
      currentSpecialistIndex: nextIndex,
      ...(trackAnalysis && {
        analysisRepresentatives,
        analysisBatchInvocationIds: [],
        synthesisAssignments: analysisRepresentatives.map(
          ({ assignment }) => assignment
        ),
      }),
      specialistDecisionsResult: {
        status: "completed",
        decisions: trackAnalysis
          ? analysisRepresentatives.map((item) => item.decision)
          : decisions,
      },
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
