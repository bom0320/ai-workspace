import { pushCurrentBranch, PushBlockedError } from "@/infrastructure/git/index.js";
import { approvePush } from "../../prompts/delivery.js";

export type PushResult =
  | { status: "pushed" | "skipped" }
  | { status: "blocked" | "failed"; reason: string };

export async function runPushCommand(repositoryRoot: string, commitSha: string): Promise<PushResult> {
  try {
    if (!await approvePush()) {
      console.log("Push: skipped\nCommit remains local.");
      return { status: "skipped" };
    }
    pushCurrentBranch(repositoryRoot, commitSha);
    console.log("Push complete.");
    return { status: "pushed" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unable to push commit.";
    const status = error instanceof PushBlockedError ? "blocked" : "failed";
    console.log(`Push ${status}: ${reason}\nLocal commit was preserved.`);
    return { status, reason };
  }
}
