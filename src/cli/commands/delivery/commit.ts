import { stagePaths, commitChanges } from "@/infrastructure/git/index.js";
import { approveCommit, askCommitMessage } from "../../prompts/delivery/delivery.js";

export type CommitResult =
  | { status: "committed"; commitSha: string }
  | { status: "skipped" }
  | { status: "blocked" | "failed"; reason: string };

export function isValidCommitMessage(message: string): boolean {
  return !/[\r\n]/.test(message) && /^(feat|fix|docs|refactor|perf|test|chore)(\([^()\s:]+\))?: \S[^\r\n]*$/.test(message);
}

export async function runCommitCommand(repositoryRoot: string, paths: string[]): Promise<CommitResult> {
  try {
    if (!await approveCommit()) {
      console.log("Commit: skipped\nChanges remain in the working tree.");
      return { status: "skipped" };
    }
    const message = await askCommitMessage();
    if (!isValidCommitMessage(message)) {
      const reason = "Invalid commit message. Expected: type(scope?): subject";
      console.log(`${reason}\nExample: docs: clarify README introduction`);
      return { status: "blocked", reason };
    }
    if (paths.length === 0) {
      const reason = "No execution changedPaths are available to commit.";
      console.log(`Commit blocked: ${reason}`);
      return { status: "blocked", reason };
    }
    console.log("Commit message: valid");
    stagePaths(repositoryRoot, paths);
    const commitSha = commitChanges(repositoryRoot, message);
    console.log(`Commit created: ${commitSha}`);
    return { status: "committed", commitSha };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unable to commit changes.";
    console.log(`Commit failed: ${reason}`);
    return { status: "failed", reason };
  }
}
