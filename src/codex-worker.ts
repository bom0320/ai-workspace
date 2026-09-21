import { execFileSync } from "node:child_process";

import type { TaskContract } from "./contracts/task.js";

export function runCodexWorker(
  task: TaskContract,
  workspaceRoot: string,
): string {
  const prompt = [
    "Complete the following task within the provided repository workspace.",
    "",
    "Objective:",
    task.objective,
    "",
    "Allowed paths:",
    task.allowedPaths.map((path) => `- ${path}`).join("\n") || "- (none)",
    "",
    "Forbidden paths:",
    task.forbiddenPaths.map((path) => `- ${path}`).join("\n") || "- (none)",
    "",
    "Constraints:",
    task.constraints.map((constraint) => `- ${constraint}`).join("\n") ||
      "- (none)",
    "",
    "Acceptance criteria:",
    task.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n") ||
      "- (none)",
    "",
    "Verification:",
    task.verification.map((command) => `- ${command}`).join("\n") ||
      "- (none)",
  ].join("\n");

  try {
    return execFileSync(
      "codex",
      ["exec", "--sandbox", "workspace-write", prompt],
      {
        cwd: workspaceRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    let detail = error instanceof Error ? error.message : String(error);

    if (
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string" &&
      error.stderr.trim()
    ) {
      detail = error.stderr.trim();
    }

    throw new Error(`Failed to run Codex worker: ${detail}`, {
      cause: error,
    });
  }
}
