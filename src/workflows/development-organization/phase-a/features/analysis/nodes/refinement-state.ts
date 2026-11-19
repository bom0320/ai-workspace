import type { StaffingProposal } from "@/application/staffing/index.js";
import type { StaffingApprovalResult } from "@/application/governance/index.js";
import type { AnalysisRefinement } from "@/application/governance/model/analysis-refinement.js";
import { projectRefinementRequests } from "@/application/governance/records/analysis/refinement-records.js";
import type { PhaseAState } from "../../../state.js";
import { assessmentBasis } from "./assess-analysis.js";

export function refinementBasis(state: PhaseAState) {
  if (state.analysisAssessment?.status !== "refinement-required")
    throw new Error("Missing refinement assessment.");
  return {
    context: assessmentBasis(state),
    invocationIds: (state.analysisRepresentatives ?? []).map(
      ({ invocationId }) => invocationId
    ),
    assessment: state.analysisAssessment,
  };
}

export function beginBatch(
  round: Pick<AnalysisRefinement, "id" | "requests">,
  assignments: NonNullable<PhaseAState["synthesisAssignments"]>
): Partial<PhaseAState> {
  return {
    analysisRefinement: { status: "ready", id: round.id },
    preparedSpecialistRequests: round.requests,
    synthesisAssignments: assignments,
    currentSpecialistIndex: 0,
    collectedDecisions: [],
    analysisBatchInvocationIds: [],
    specialistDecisionsResult: undefined,
    decisionComparisonResult: undefined,
  };
}

export function refinementApproval(
  proposal: StaffingProposal,
  result: StaffingApprovalResult
): Partial<PhaseAState> {
  if (result.status === "approved" && proposal.refinement) {
    const { scope } = result;
    return beginBatch(
      {
        id: proposal.refinement.id,
        requests: projectRefinementRequests(scope),
      },
      scope.assignments.map(({ assignmentId, specialistId, objective }) => ({
        assignmentId,
        specialistId,
        objective,
      }))
    );
  }
  if (result.status === "approval-required")
    return {
      analysisRefinement: {
        status: "approval-required",
        proposal,
        request: { ...result, kind: "staffing", subject: proposal },
      },
    };
  return {
    analysisRefinement: {
      status: "denied",
      reason:
        result.status === "denied"
          ? result.reason
          : "Refinement approval failed.",
    },
  };
}
