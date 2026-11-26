import { createPhaseAGraph } from "../graph.js";
import type { StaffingApprovalResult } from "@/application/governance/index.js";

import type {
  RunStaffingOptions,
  StaffingRunResult,
} from "@/application/management/allocation/analysis-assignment/index.js";

import type { StaffingConfirmationOptions } from "../features/governance/nodes/staffing-approval/confirm-staffing-approval.js";

type ApprovalRequest = Extract<
  StaffingApprovalResult,
  { status: "approval-required" }
>;

export type StaffingApprovalWorkflowOptions = Omit<
  RunStaffingOptions,
  "systemPolicy" | "assignmentConstraints"
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
  // Keep this CLI endpoint at approval even as the Phase A Graph gains later stages.
  const state = await createPhaseAGraph({
    ...options,
    executionTarget: "staffing-approval",
    allowDirectStaffingApproval: true,
  }).invoke({
    goal: options.goal,
    repositoryPath: options.repositoryPath,
  });

  // 2. Project Independent Stage Results Into the Existing External Contract
  // This adapter owns presentation of the combined result, never Graph State.
  const { policyLookup, staffingResult, approvalResult } = state;
  if (policyLookup?.status === "denied") {
    if (staffingResult || approvalResult)
      throw new Error(
        "Policy denial cannot contain Staffing or Approval results."
      );
    return {
      status: "failed",
      failure: "system-policy",
      reason: policyLookup.reason,
      rounds: 0,
    };
  }
  if (policyLookup?.status !== "ready" || !staffingResult)
    throw new Error("Phase A returned no Staffing Approval outcome.");
  if (staffingResult.status !== "proposed") {
    if (approvalResult)
      throw new Error("Approval requires a proposed Staffing result.");
    return staffingResult;
  }
  if (!approvalResult)
    throw new Error("Phase A returned no Staffing Approval outcome.");
  if (approvalResult.status === "approval-required")
    return { status: "approval-required", request: approvalResult };
  return approvalResult;
}
