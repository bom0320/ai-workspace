import {
  approveStaffingProposal,
  type StaffingApprovalResult,
} from "@/application/governance/index.js";
import {
  staffingApprovalEvaluationSchema,
  type PhaseAState,
} from "../../../state.js";
import type { HumanConfirmation } from "@/infrastructure/terminal/index.js";

export type StaffingConfirmationOptions = {
  confirmApproval?: (
    request: Extract<StaffingApprovalResult, { status: "approval-required" }>
  ) => HumanConfirmation | null | Promise<HumanConfirmation | null>;
};

export function createConfirmStaffingApprovalNode(
  confirmApproval: StaffingConfirmationOptions["confirmApproval"]
) {
  return async (state: PhaseAState): Promise<Partial<PhaseAState>> => {
    // 1. Check Human Confirmation Availability
    if (
      state.staffingResult?.status !== "proposed" ||
      state.approvalResult?.status !== "approval-required"
    )
      throw new Error(
        "Human confirmation requires a proposed Staffing approval request."
      );
    if (!confirmApproval) return {};

    try {
      // 2. Request Human Confirmation
      // Evaluation has released the Ledger lock. UI receives a detached review copy.
      const receipt = await confirmApproval(
        structuredClone(state.approvalResult)
      );
      if (!receipt)
        return {
          approvalResult: {
            status: "rejected",
            reason: "Human rejected staffing or confirmation was unavailable.",
          },
        };

      // 3. Revalidate and Finalize Approval
      // Keep the one-use receipt local, not in State. Reuse the original Proposal;
      // Governance rechecks current Repository and policy after the Human wait.
      const approvalResult = approveStaffingProposal(
        state.staffingResult.proposal,
        receipt
      );
      const finalApproval =
        staffingApprovalEvaluationSchema.safeParse(approvalResult);
      if (
        finalApproval.success &&
        (finalApproval.data.status === "approved" ||
          finalApproval.data.status === "denied")
      )
        return { approvalResult: finalApproval.data };
      return {
        approvalResult: {
          status: "denied",
          reason: "Staffing confirmation did not complete approval.",
        },
      };
    } catch {
      return {
        approvalResult: {
          status: "failed",
          failure: "confirmation",
          reason: "Human Staffing confirmation failed.",
          rounds: state.staffingResult.rounds,
        },
      };
    }
  };
}
