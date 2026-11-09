import {
  getStaffingSystemPolicy,
  approveStaffingProposal,
  type StaffingApprovalResult,
} from "@/application/governance/index.js";

import {
  runStaffing,
  type RunStaffingOptions,
  type StaffingRunResult,
} from "@/application/staffing/index.js";

import type { HumanConfirmation } from "@/infrastructure/terminal/index.js";

// Types

type ApprovalRequest = Extract<
  StaffingApprovalResult,
  { status: "approval-required" }
>;

export type StaffingApprovalWorkflowOptions = Omit<
  RunStaffingOptions,
  "systemPolicy"
> & {
  repositoryPath: string;
  confirmApproval?: (
    request: ApprovalRequest
  ) => HumanConfirmation | null | Promise<HumanConfirmation | null>;
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

// Workflow

export async function runStaffingApproval(
  options: StaffingApprovalWorkflowOptions
): Promise<StaffingApprovalWorkflowResult> {
  // 1. Load System Policy

  const policy = getStaffingSystemPolicy(options.repositoryPath);

  if (policy.status !== "ready") {
    return {
      status: "failed",
      failure: "system-policy",
      reason: policy.reason,
      rounds: 0,
    };
  }

  // 2. Run Staffing

  const staffing = await runStaffing({
    goal: options.goal,
    systemPolicy: policy.configuration,
    maxRounds: options.maxRounds,
    timeoutMs: options.timeoutMs,
    agent: options.agent,
  });

  if (staffing.status !== "proposed") {
    return staffing;
  }

  // 3. Evaluate Staffing Approval

  const proposal = staffing.proposal;
  const approval = approveStaffingProposal(proposal);

  if (approval.status === "approved" || approval.status === "denied") {
    return approval;
  }

  if (approval.status !== "approval-required" || approval.kind !== "staffing") {
    return {
      status: "denied",
      reason: "Unexpected Staffing approval result.",
    };
  }

  if (!options.confirmApproval) {
    return {
      status: "approval-required",
      request: approval,
    };
  }

  // 4. Request Human Confirmation

  try {
    const receipt = await options.confirmApproval(structuredClone(approval));

    if (!receipt) {
      return {
        status: "rejected",
        reason: "Human rejected staffing or confirmation was unavailable.",
      };
    }

    // 5. Revalidate and Finalize Approval

    const result = approveStaffingProposal(proposal, receipt);

    if (result.status === "approved" || result.status === "denied") {
      return result;
    }

    return {
      status: "denied",
      reason: "Staffing confirmation did not complete approval.",
    };
  } catch {
    return {
      status: "failed",
      failure: "confirmation",
      reason: "Human Staffing confirmation failed.",
      rounds: staffing.rounds,
    };
  }
}
