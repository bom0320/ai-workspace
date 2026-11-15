import { approveStaffingProposal } from "@/application/governance/index.js";
import {
  staffingApprovalEvaluationSchema,
  type PhaseAState,
} from "../state.js";

export function evaluateStaffingApproval(
  state: PhaseAState
): Partial<PhaseAState> {
  // 1. Require a Proposed Staffing Result
  if (state.staffingResult?.status !== "proposed")
    throw new Error("Approval evaluation requires a Staffing Proposal.");

  // 2. Evaluate the Original Proposal
  // Governance alone issues Scope or requests a bound Human confirmation.
  // No receipt is fabricated and the CEO is not rerun for approval evaluation.
  const result = approveStaffingProposal(state.staffingResult.proposal);

  // 3. Return Approval Evaluation Result
  const approval = staffingApprovalEvaluationSchema.safeParse(result);
  return {
    approvalResult: approval.success
      ? approval.data
      : { status: "denied", reason: "Unexpected Staffing approval result." },
  };
}
