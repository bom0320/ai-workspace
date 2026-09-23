import { execFileSync } from "node:child_process";

import type { VerificationResult } from "./verification-runner.js";

export type ExecutionEvidence = {
  workerOutput: string;
  changedPaths: string[];
  verification: VerificationResult;
};

export function collectChangedPaths(workspaceRoot: string): string[] {
  try {
    const tracked = execFileSync(
      "git",
      ["-C", workspaceRoot, "diff", "--name-only", "-z", "HEAD", "--"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const untracked = execFileSync(
      "git",
      [
        "-C",
        workspaceRoot,
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );

    return [
      ...new Set(
        `${tracked}${untracked}`
          .split("\0")
          .filter((path) => path.length > 0),
      ),
    ].sort();
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
