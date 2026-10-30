import { readFileSync } from "node:fs";
import {
  approveStaffingProposal,
  configureHumanDelegation,
  configureStaffingSystemPolicy,
} from "@/application/governance/index.js";
import { staffingProposalSchema } from "@/application/staffing/index.js";
import { confirmHumanAction } from "@/infrastructure/terminal/index.js";

// Explicit commands only; no changes to existing v0-v3 selector/approval gates.
export async function runGovernanceCli(args: string[]): Promise<number> {
  try {
    const [action, path, extra] = args;
    const load = (file: string | undefined): unknown => {
      if (!file) throw new Error("JSON file is required.");
      return JSON.parse(readFileSync(file, "utf8"));
    };
    const input =
      action === "revoke" ? null : load(action === "delegate" ? extra : path);
    const run = (receipt?: Parameters<typeof approveStaffingProposal>[1]) => {
      if (action === "setup")
        return configureStaffingSystemPolicy(input, receipt);
      if (action === "delegate" || action === "revoke") {
        if (!path) throw new Error("Repository is required.");
        return configureHumanDelegation(path, input, receipt);
      }
      if (action === "approve") return approveStaffingProposal(input, receipt);
      throw new Error(
        "Use governance setup <system.json> | delegate <repository> <policy.json> | revoke <repository> | approve <proposal.json>."
      );
    };
    let result = run();
    if (result.status === "approval-required") {
      let review = result.reason;
      if (result.kind === "staffing") {
        const proposal = staffingProposalSchema.parse(result.subject);
        review += `\nGoal: ${proposal.goal.objective}\nHuman Constraints:\n${(proposal.goal.constraints ?? []).map((item) => `- ${item}`).join("\n") || "None"}\nAssignments:\n${proposal.assignments.map((assignment) => `- ${assignment.specialistId}: ${assignment.objective}\n  Context: ${assignment.contextPaths.join(", ")}`).join("\n")}\nInvocation Budget: ${proposal.budget.maxAgentInvocations}\nThis approves staffing only, not solution direction, Tasks or execution. To change staffing, reject and create a new validated Proposal.`;
      } else {
        review += `\n${JSON.stringify(result.subject, null, 2)}\nPhase A read-only analysis only. Invocation budgets are per Proposal/Scope limits, not cumulative usage reservations. No natural-language compliance or execution authority is implied.`;
        if (result.kind === "delegation" && result.subject !== null)
          review +=
            "\nFuture Goals within this delegation may be approved without per-Goal Human input.";
      }
      const receipt = confirmHumanAction(result.binding, review);
      if (!receipt) {
        console.log(
          "Governance: rejected or interactive terminal unavailable."
        );
        return 1;
      }
      result = run(receipt);
    }
    console.log(JSON.stringify(result, null, 2));
    return result.status === "approved" || result.status === "configured"
      ? 0
      : 1;
  } catch {
    console.error(
      "Governance command failed; check configuration, trusted records and repository state."
    );
    return 1;
  }
}
