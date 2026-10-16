import type { ExecutionResult } from "@/application/execution/index.js";
import { removeExecutionWorkspace } from "@/infrastructure/git/index.js";
import { approveWorkspaceDeletion } from "../../prompts/cleanup/cleanup.js";

export type WorkspaceCleanupResult =
  | { status: "deleted"; durationMs: number }
  | { status: "kept" | "not-needed" }
  | { status: "failed"; reason: string; durationMs: number };

export async function runWorkspaceCleanup(repositoryRoot: string, execution: ExecutionResult): Promise<WorkspaceCleanupResult> {
  if (!execution.workspace) return { status: "not-needed" };
  let startedAt: number | undefined;
  try {
    if (!await approveWorkspaceDeletion()) {
      console.log(`Workspace preserved at:\n${execution.workspace.path}`);
      return { status: "kept" };
    }
    startedAt = performance.now();
    removeExecutionWorkspace(repositoryRoot, execution.workspace.path);
    console.log("Workspace removed.");
    return { status: "deleted", durationMs: performance.now() - startedAt };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unable to remove workspace.";
    console.log(`Cleanup failed: ${reason}\nWorkspace preserved at:\n${execution.workspace.path}`);
    return { status: "failed", reason, durationMs: startedAt === undefined ? 0 : performance.now() - startedAt };
  } finally {
    if (execution.artifacts) console.log(`Artifacts preserved at:\n${execution.artifacts.directory}`);
  }
}
