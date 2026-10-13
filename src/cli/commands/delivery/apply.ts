import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ExecutionResult } from "@/application/execution/index.js";
import { applyPatch, PatchApplyError } from "@/infrastructure/git/index.js";
import { approveApply } from "../../prompts/apply-changes.js";

export type ApplyResult =
  | { status: "applied" }
  | { status: "skipped" }
  | { status: "blocked" | "failed"; reason: string };

export async function runApplyCommand(repositoryRoot: string, execution: ExecutionResult): Promise<ApplyResult> {
  if (!execution.passed || !execution.evidence.verification?.passed || !execution.artifacts) {
    return { status: "skipped" };
  }
  const patchPath = join(execution.artifacts.directory, "changes.patch");
  if (!existsSync(patchPath)) {
    console.log("Changes were not applied. Preserved patch is unavailable.");
    return { status: "blocked", reason: "Preserved patch is unavailable." };
  }
  let result: ApplyResult;
  try {
    if (await approveApply()) {
      applyPatch(repositoryRoot, patchPath);
      console.log("Changes applied to original repository.");
      return { status: "applied" };
    }
    result = { status: "skipped" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unable to apply changes.";
    result = { status: error instanceof PatchApplyError && error.stage === "dirty" ? "blocked" : "failed", reason };
  }
  console.log("Changes were not applied.");
  if ("reason" in result) console.log(result.reason);
  console.log(`Patch preserved at:\n${patchPath}`);
  return result;
}
