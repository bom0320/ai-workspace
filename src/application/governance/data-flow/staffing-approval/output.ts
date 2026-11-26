import type { StaffingProposal } from "@/application/management/allocation/analysis-assignment/index.js";
import type { StaffingSystemPolicy } from "@/contracts/governance/staffing-system-policy.js";
import type { HumanDelegationPolicyInput } from "../../approval/features/human-delegation/model/policy.js";
import type { ApprovedOperatingScope } from "../../model/authority.js";
import type { ApprovalRecord } from "../../approval/features/proposal-management/model/approval.js";

// Shared public response across configuration, delegation and proposal approval.
export type StaffingApprovalResult =
  | {
      status: "approved";
      approval: ApprovalRecord;
      scope: ApprovedOperatingScope;
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
