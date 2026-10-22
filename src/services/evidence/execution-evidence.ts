import { getWorkspaceChangedPaths } from "@/infrastructure/git/index.js";

import type { VerificationResult } from "@/services/verification/index.js";

export type ExecutionEvidence = {
  workerOutput?: string;
  changedPaths?: string[];
  verification?: VerificationResult;
};

export function collectChangedPaths(
  workspaceRoot: string,
  baseCommit: string
): string[] {
  try {
    return getWorkspaceChangedPaths(workspaceRoot, baseCommit);
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

    throw new Error(`Failed to collect execution evidence: ${detail}`, {
      cause: error,
    });
  }
}
