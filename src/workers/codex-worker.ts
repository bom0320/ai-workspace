import type { TaskContract } from "../contracts/task.js";
import { runCommand } from "../execution/command-runner.js";

export const DEFAULT_CODEX_WORKER_TIMEOUT_MS = 15 * 60 * 1_000;

export async function runCodexWorker(
  task: TaskContract,
  workspaceRoot: string,
  timeoutMs = DEFAULT_CODEX_WORKER_TIMEOUT_MS,
): Promise<string> {
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

  const result = await runCommand(
    "codex",
    ["exec", "--sandbox", "workspace-write", prompt],
    { cwd: workspaceRoot, timeoutMs },
  );

  if (result.timedOut) {
    const error = new Error(`Codex worker timed out after ${timeoutMs} ms.`);
    throw new Error(`Failed to run Codex worker: ${error.message}`, {
      cause: error,
    });
  }

  if (result.error || result.exitCode !== 0) {
    const detail =
      result.stderr.trim() ||
      result.error?.message ||
      `Codex exited with code ${result.exitCode ?? "unavailable"}.`;
    const error = result.error ?? new Error(detail);
    throw new Error(`Failed to run Codex worker: ${detail}`, {
      cause: error,
    });
  }

  return result.stdout;
}
