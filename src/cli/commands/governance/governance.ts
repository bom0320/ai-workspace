import { readFileSync } from "node:fs";
import {
  approveStaffingProposal,
  configureHumanDelegation,
  configureStaffingSystemPolicy,
} from "@/application/governance/index.js";
import {
  confirmHumanAction,
  type HumanConfirmation,
} from "@/infrastructure/terminal/index.js";
import { formatGovernanceReview } from "../../presenters/governance/approval-review.js";

function readGovernanceCommand(args: string[]) {
  const [action, path, extra] = args;
  const load = (file: string | undefined): unknown => {
    if (!file) throw new Error("JSON file is required.");
    return JSON.parse(readFileSync(file, "utf8"));
  };
  const input =
    action === "revoke" ? null : load(action === "delegate" ? extra : path);
  return { action, path, input };
}

function executeGovernanceCommand(
  command: ReturnType<typeof readGovernanceCommand>,
  receipt?: HumanConfirmation
) {
  const { action, path, input } = command;
  if (action === "setup") return configureStaffingSystemPolicy(input, receipt);
  if (action === "delegate" || action === "revoke") {
    if (!path) throw new Error("Repository is required.");
    return configureHumanDelegation(path, input, receipt);
  }
  if (action === "approve") return approveStaffingProposal(input, receipt);
  throw new Error(
    "Use governance setup <system.json> | delegate <repository> <policy.json> | revoke <repository> | approve <proposal.json>."
  );
}

// Explicit commands only; no changes to existing v0-v3 selector/approval gates.
export async function runGovernanceCli(args: string[]): Promise<number> {
  try {
    const command = readGovernanceCommand(args);
    let result = executeGovernanceCommand(command);
    if (result.status === "approval-required") {
      const review = formatGovernanceReview(result);
      const receipt = confirmHumanAction(result.binding, review);
      if (!receipt) {
        console.log(
          "Governance: rejected or interactive terminal unavailable."
        );
        return 1;
      }
      result = executeGovernanceCommand(command, receipt);
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
