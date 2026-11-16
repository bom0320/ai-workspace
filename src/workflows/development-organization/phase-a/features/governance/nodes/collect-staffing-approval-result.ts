import type { PhaseAState } from "../../../state.js";

export function collectStaffingApprovalResult(
  state: PhaseAState
): Partial<PhaseAState> {
  // 1. Preserve Explicit Incomplete Outcomes
  if (state.policyLookup?.status === "denied")
    return {
      staffingApprovalResult: {
        status: "failed",
        failure: "system-policy",
        reason: state.policyLookup.reason,
        rounds: 0,
      },
    };
  if (state.staffingResult && state.staffingResult.status !== "proposed")
    return { staffingApprovalResult: state.staffingResult };

  // 2. Publish the Approval Outcome
  // END means this execution range ended, not that Phase A succeeded.
  if (state.approvalResult?.status === "approval-required")
    return {
      staffingApprovalResult: {
        status: "approval-required",
        request: state.approvalResult,
      },
    };
  if (state.approvalResult)
    return { staffingApprovalResult: state.approvalResult };
  throw new Error("Staffing Approval ended without an outcome.");
}
