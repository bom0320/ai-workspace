import type { StaffingApprovalResult } from "../../../data-flow/staffing-approval/output.js";

export function deniedStaffingApproval(): StaffingApprovalResult {
  return {
    status: "denied",
    reason:
      "Approval denied: invalid or untrusted records, System Policy violation, stale approval/delegation, duplicate Proposal or Snapshot drift. Legacy System Policies require explicit Human reapproval.",
  };
}
