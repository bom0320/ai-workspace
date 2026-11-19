import { approveRefinementProposal } from "@/application/governance/approval/features/proposal-management/flow/approve-staffing-proposal.js";
import { prepareAnalysisRefinement } from "@/application/governance/records/analysis/prepare-analysis-refinement.js";
import type { PhaseAState } from "../../../state.js";
import {
  beginBatch,
  refinementApproval,
  refinementBasis,
} from "./refinement-state.js";

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
