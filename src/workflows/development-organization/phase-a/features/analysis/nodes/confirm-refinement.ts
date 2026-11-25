import type { PhaseANodeInput, PhaseANodeOutput } from "../../../data-flow.js";
import { approveRefinementProposal } from "@/application/governance/approval/features/proposal-management/flow/approve-staffing-proposal.js";
import type { StaffingConfirmationOptions } from "../../governance/nodes/staffing-approval/confirm-staffing-approval.js";
import { refinementApproval, refinementBasis } from "./refinement-state.js";

export function createConfirmRefinementNode(
  confirm: StaffingConfirmationOptions["confirmApproval"]
) {
  return async (
    state: PhaseANodeInput<"confirm-refinement">
  ): Promise<PhaseANodeOutput<"confirm-refinement">> => {
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
