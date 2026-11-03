import { z } from "zod";
import type { StaffingProposal } from "@/application/staffing/index.js";
import type { StaffingSystemPolicy } from "../../features/system-policy/model/policy.js";
import type { HumanDelegationPolicyInput } from "../../features/human-delegation/model/policy.js";
import { approvedOperatingScopeSchema } from "../../../model/authority.js";
import type { ApprovalRecord } from "../../features/proposal-management/model/approval.js";

// Shared public response across configuration, delegation and proposal approval.
export type StaffingApprovalResult =
  | {
      status: "approved";
      approval: ApprovalRecord;
      scope: z.infer<typeof approvedOperatingScopeSchema>;
    }
  | { status: "configured"; version: number }
  | {
      status: "approval-required";
      kind: "system-policy" | "delegation" | "staffing";
      binding: string;
      reason: string;
      subject:
        | StaffingSystemPolicy
        | HumanDelegationPolicyInput
        | StaffingProposal
        | null;
    }
  | { status: "denied"; reason: string };

export function deniedStaffingApproval(): StaffingApprovalResult {
  return {
    status: "denied",
    reason:
      "Approval denied: invalid or untrusted records, System Policy violation, stale approval/delegation, duplicate Proposal or Snapshot drift.",
  };
}
