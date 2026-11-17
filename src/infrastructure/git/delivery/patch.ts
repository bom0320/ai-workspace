import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { isRepositoryClean } from "../repository/status.js";

export class PatchApplyError extends Error {
  constructor(
    public readonly stage: "dirty" | "check" | "apply",
    message: string,
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = "PatchApplyError";
  }
}

export function applyPatch(repositoryRoot: string, patchPath: string): void {
  if (!isRepositoryClean(repositoryRoot)) {
    throw new PatchApplyError(
      "dirty",
      "Original repository has uncommitted changes."
    );
  }
  const patch = resolve(patchPath);
  try {
    execFileSync("git", ["apply", "--check", "--", patch], {
      cwd: repositoryRoot,
      stdio: "pipe",
    });
  } catch (cause) {
    throw new PatchApplyError(
      "check",
      "Patch no longer applies cleanly to the original repository.",
      cause
    );
  }
  try {
    execFileSync("git", ["apply", "--", patch], {
      cwd: repositoryRoot,
      stdio: "pipe",
    });
  } catch (cause) {
    throw new PatchApplyError(
      "apply",
      "Unable to apply patch to the original repository.",
      cause
    );
  }
}
