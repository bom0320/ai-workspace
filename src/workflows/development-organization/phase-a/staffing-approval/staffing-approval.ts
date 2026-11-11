import {
  getStaffingSystemPolicy,
  approveStaffingProposal,
  type StaffingApprovalResult,
} from "@/application/governance/index.js";

import {
  runStaffing,
  type RunStaffingOptions,
  type StaffingRunResult,
  type StaffingProposal,
} from "@/application/staffing/index.js";

import type { HumanConfirmation } from "@/infrastructure/terminal/index.js";

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

export async function runStaffingApproval(
  options: StaffingApprovalWorkflowOptions
): Promise<StaffingApprovalWorkflowResult> {
  // 1. Load System Policy
  const systemPolicy = getStaffingSystemPolicy(options.repositoryPath);

  if (systemPolicy.status !== "ready") {
    return {
      status: "failed",
      failure: "system-policy",
      reason: systemPolicy.reason,
      rounds: 0,
    };
  }

  // 2. Run Staffing
  const staffing = await runStaffing({
    goal: options.goal,
    systemPolicy: systemPolicy.configuration,
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

  // 4. Request Human Confirmation
  // 5. Revalidate and Finalize Approval
  return confirmAndFinalizeStaffingApproval(
    proposal,
    approval,
    options,
    staffing.rounds
  );
}

async function confirmAndFinalizeStaffingApproval(
  proposal: StaffingProposal,
  approvalRequest: ApprovalRequest,
  options: StaffingApprovalWorkflowOptions,
  rounds: number
): Promise<StaffingApprovalWorkflowResult> {
  // 1. Check Human Confirmation Availability
  if (!options.confirmApproval) {
    return {
      status: "approval-required",
      request: approvalRequest,
    };
  }

  // Approval's transaction has returned; Human input must not hold its Ledger lock.
  // Isolate the review copy so UI mutations cannot change the approved Proposal.
  try {
    // 2. Request Human Confirmation
    const receipt = await options.confirmApproval(
      structuredClone(approvalRequest)
    );

    if (!receipt) {
      return {
        status: "rejected",
        reason: "Human rejected staffing or confirmation was unavailable.",
      };
    }

    // 3. Revalidate and Finalize Approval
    // The receipt is bound to the reviewed Proposal, so finalization reuses it.
    // Governance revalidates current policy after the Human wait.
    const finalApproval = approveStaffingProposal(proposal, receipt);

    if (
      finalApproval.status === "approved" ||
      finalApproval.status === "denied"
    ) {
      return finalApproval;
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
      rounds,
    };
  }
}
