import { createPhaseAGraph } from "../graph.js";
import type { StaffingApprovalResult } from "@/application/governance/index.js";

import type {
  RunStaffingOptions,
  StaffingRunResult,
} from "@/application/staffing/index.js";

import type { StaffingConfirmationOptions } from "../nodes/approval/confirm-staffing-approval.js";

type ApprovalRequest = Extract<
  StaffingApprovalResult,
  { status: "approval-required" }
>;

export type StaffingApprovalWorkflowOptions = Omit<
  RunStaffingOptions,
  "systemPolicy"
> &
  StaffingConfirmationOptions & {
    repositoryPath: string;
  };

export type StaffingApprovalWorkflowResult =
  | Exclude<StaffingRunResult, { status: "proposed" }>
  | Extract<StaffingApprovalResult, { status: "approved" | "denied" }>
  | { status: "approval-required"; request: ApprovalRequest }
  | { status: "rejected"; reason: string }
  | {
      status: "failed";
      failure: "system-policy" | "confirmation";
      reason: string;
      rounds: number;
    };

export async function runStaffingApproval(
  options: StaffingApprovalWorkflowOptions
): Promise<StaffingApprovalWorkflowResult> {
  // 1. Execute the Current Phase A Staffing Approval Flow
  // Step 3 must revisit this CLI contract before adding Specialist execution here.
  const state = await createPhaseAGraph(options).invoke({
    goal: options.goal,
    repositoryPath: options.repositoryPath,
  });

  // 2. Return the Existing Workflow Contract
  if (!state.staffingApprovalResult)
    throw new Error("Phase A returned no Staffing Approval outcome.");
  return state.staffingApprovalResult;
}
