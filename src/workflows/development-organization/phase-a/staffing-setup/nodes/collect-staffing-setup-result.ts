import type { StaffingSetupState } from "../state.js";

export function collectStaffingSetupResult(
  state: StaffingSetupState
): Partial<StaffingSetupState> {
  // 1. Preserve Explicit Incomplete Outcomes
  if (state.policyLookup?.status === "denied")
    return {
      staffingSetupResult: {
        status: "failed",
        failure: "system-policy",
        reason: state.policyLookup.reason,
        rounds: 0,
      },
    };
  if (state.staffingResult && state.staffingResult.status !== "proposed")
    return { staffingSetupResult: state.staffingResult };

  // 2. Publish the Approval Outcome
  // END means this execution range ended, not that Phase A succeeded.
  if (state.approvalResult?.status === "approval-required")
    return {
      staffingSetupResult: {
        status: "approval-required",
        request: state.approvalResult,
      },
    };
  if (state.approvalResult)
    return { staffingSetupResult: state.approvalResult };
  throw new Error("Staffing Setup ended without an approval outcome.");
}
