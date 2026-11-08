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

// This first Phase A workflow ends at Scope issuance, never Invocation.
// Applications retain policy, finalization, confirmation and transaction rules.
export async function runStaffingApproval(
  options: StaffingApprovalWorkflowOptions
): Promise<StaffingApprovalWorkflowResult> {
  const policy = getStaffingSystemPolicy(options.repositoryPath);
  if (policy.status !== "ready")
    return {
      status: "failed",
      failure: "system-policy",
      reason: policy.reason,
      rounds: 0,
    };

  const staffing = await runStaffing({
    goal: options.goal,
    systemPolicy: policy.configuration,
    maxRounds: options.maxRounds,
    timeoutMs: options.timeoutMs,
    agent: options.agent,
  });
  if (staffing.status !== "proposed") return staffing;

  const proposal = staffing.proposal;
  const approval = approveStaffingProposal(proposal);
  if (approval.status === "approved" || approval.status === "denied")
    return approval;
  if (approval.status !== "approval-required" || approval.kind !== "staffing")
    return { status: "denied", reason: "Unexpected Staffing approval result." };
  if (!options.confirmApproval)
    return { status: "approval-required", request: approval };

  try {
    // The UI receives a detached review, not the Proposal resubmitted below.
    const receipt = await options.confirmApproval(structuredClone(approval));
    if (!receipt)
      return {
        status: "rejected",
        reason: "Human rejected staffing or confirmation was unavailable.",
      };
    // Governance rechecks the latest policy, binding and Snapshot here. Do not
    // rerun Staffing, recapture a Snapshot or impose a start-version equality.
    const result = approveStaffingProposal(proposal, receipt);
    if (result.status === "approved" || result.status === "denied")
      return result;
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
