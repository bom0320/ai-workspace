import { readFileSync } from "node:fs";
import { goalSpecSchema } from "@/contracts/goal.js";
import { runStaffingApproval } from "@/workflows/development-organization/phase-a/index.js";
import { confirmHumanAction } from "@/infrastructure/terminal/index.js";
import { formatGovernanceReview } from "../../presenters/governance/approval-review.js";

// Only Goal input uses a file. The finalized Proposal stays in memory throughout.
export async function runStaffingCli(args: string[]): Promise<number> {
  try {
    const [repositoryPath, goalPath, extra] = args;
    if (!repositoryPath || !goalPath || extra !== undefined)
      throw new Error("Use staffing <repository> <goal.json>.");
    const goal = goalSpecSchema
      .strict()
      .parse(JSON.parse(readFileSync(goalPath, "utf8")));
    const result = await runStaffingApproval({
      goal,
      repositoryPath,
      maxRounds: 4,
      confirmApproval: (request) =>
        confirmHumanAction(request.binding, formatGovernanceReview(request)),
    });
    console.log(JSON.stringify(result, null, 2));
    return result.status === "approved" ? 0 : 1;
  } catch {
    console.error(
      "Staffing workflow failed; use staffing <repository> <goal.json> with valid Goal input and trusted Governance configuration."
    );
    return 1;
  }
}
