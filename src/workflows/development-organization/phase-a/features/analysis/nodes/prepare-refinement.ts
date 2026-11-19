import type { StaffingProposal } from "@/application/staffing/index.js";
import { approveRefinementProposal } from "@/application/governance/approval/features/proposal-management/flow/approve-staffing-proposal.js";
import {
  prepareAnalysisRefinement,
  projectRefinementRequests,
} from "@/application/governance/authorization/features/specialist-invocation/flow/prepare-analysis-refinement.js";
import type { AnalysisRefinement } from "@/application/governance/authorization/features/specialist-invocation/model/analysis-refinement.js";
import type { StaffingApprovalResult } from "@/application/governance/index.js";
import type { PhaseAState } from "../../../state.js";
import type { StaffingConfirmationOptions } from "../../governance/nodes/staffing-approval/confirm-staffing-approval.js";
import { assessmentBasis } from "./assess-analysis.js";

function refinementBasis(state: PhaseAState) {
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

function beginBatch(
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

function refinementApproval(
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

export function prepareRefinementNode(
  state: PhaseAState
): Partial<PhaseAState> {
  try {
    if (
      state.analysisAssessment?.status !== "refinement-required" ||
      state.approvalResult?.status !== "approved"
    )
      throw new Error("Missing verified Assessment or initial Scope.");
    const basis = refinementBasis(state);
    const result = prepareAnalysisRefinement(
      state.approvalResult.scope.id,
      basis.context,
      basis.invocationIds,
      basis.assessment
    );
    if (result.status === "proposal-required")
      return refinementApproval(
        result.proposal,
        approveRefinementProposal(result.proposal, basis)
      );
    const assignments = result.round.requests.map(({ assignmentId }) => {
      const match = state.analysisRepresentatives?.find(
        ({ assignment }) => assignment.assignmentId === assignmentId
      );
      if (!match) throw new Error("Missing approved Assignment.");
      return match.assignment;
    });
    return beginBatch(result.round, assignments);
  } catch {
    return {
      analysisRefinement: {
        status: "denied",
        reason:
          "Refinement scope, provenance, freshness or analysis limits could not be verified.",
      },
    };
  }
}

export function createConfirmRefinementNode(
  confirm: StaffingConfirmationOptions["confirmApproval"]
) {
  return async (state: PhaseAState): Promise<Partial<PhaseAState>> => {
    const pending = state.analysisRefinement;
    if (
      pending?.status !== "approval-required" ||
      !confirm ||
      pending.request.status !== "approval-required"
    )
      return {};
    try {
      const basis = refinementBasis(state);
      const receipt = await confirm(structuredClone(pending.request));
      if (receipt) {
        const next = refinementApproval(
          pending.proposal,
          approveRefinementProposal(pending.proposal, basis, receipt)
        );
        if (next.analysisRefinement?.status !== "approval-required")
          return next;
      }
    } catch {
      // No receipt or a failed confirmation terminates the round.
    }
    return {
      analysisRefinement: {
        status: "denied",
        reason:
          "Human Staffing confirmation was unavailable, rejected or invalid.",
      },
    };
  };
}
