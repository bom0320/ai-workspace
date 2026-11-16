import { createStaffingSetupGraph } from "../staffing-setup/graph.js";
import type { StaffingApprovalResult } from "@/application/governance/index.js";

import type {
  RunStaffingOptions,
  StaffingRunResult,
} from "@/application/staffing/index.js";

import type { StaffingConfirmationOptions } from "../staffing-setup/nodes/confirm-staffing-approval.js";

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
  // 1. Execute Staffing Setup Only
  // This entrypoint must never inherit later Phase A Specialist execution.
  const state = await createStaffingSetupGraph(options).invoke({
    goal: options.goal,
    repositoryPath: options.repositoryPath,
  });

  // 2. Return the Existing Workflow Contract
  if (!state.staffingSetupResult)
    throw new Error("Staffing Setup returned no outcome.");
  return state.staffingSetupResult;
}
