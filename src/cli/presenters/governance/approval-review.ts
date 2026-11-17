import type { StaffingApprovalResult } from "@/application/governance/index.js";
import { staffingProposalSchema } from "@/application/staffing/index.js";

type ApprovalRequest = Extract<
  StaffingApprovalResult,
  { status: "approval-required" }
>;

// Returns the exact review text; secure terminal I/O and confirmation stay with
// the caller. Displaying a proposal never changes its approval state.
export function formatGovernanceReview(request: ApprovalRequest): string {
  if (request.kind === "staffing") {
    const proposal = staffingProposalSchema.parse(request.subject);
    const constraints =
      (proposal.goal.constraints ?? []).map((item) => `- ${item}`).join("\n") ||
      "None";
    const assignments = proposal.assignments
      .map(
        (assignment) =>
          `- ${assignment.specialistId}: ${assignment.objective}\n  Context: ${assignment.contextPaths.join(", ")}`
      )
      .join("\n");
    return [
      request.reason,
      `Goal: ${proposal.goal.objective}`,
      "Human Constraints:",
      constraints,
      "Assignments:",
      assignments,
      `Invocation Budget: ${proposal.budget.maxAgentInvocations}`,
      "This approves staffing only, not solution direction, Tasks or execution. To change staffing, reject and create a new validated Proposal.",
    ].join("\n");
  }
  const lines = [
    request.reason,
    JSON.stringify(request.subject, null, 2),
    "Phase A read-only analysis only. Invocation budgets are per Proposal/Scope limits, not cumulative usage reservations. No natural-language compliance or execution authority is implied.",
  ];
  if (request.kind === "delegation" && request.subject !== null)
    lines.push(
      "Future Goals within this delegation may be approved without per-Goal Human input."
    );
  return lines.join("\n");
}
