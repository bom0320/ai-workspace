import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative, sep } from "node:path";
import type { ExecutionRequest } from "@/application/governance/index.js";
import { assertGovernedGitConfiguration } from "@/infrastructure/git/index.js";

export function checkGovernedWorkerRuntime(request: ExecutionRequest) {
  if (process.platform === "win32" || request.timeoutMs > 2_147_483_647)
    return {
      status: "blocked" as const,
      reason:
        "The Codex Worktree runtime does not support this host or timeout.",
    };

  try {
    const temporaryRoot = realpathSync(tmpdir());
    const fromRepository = relative(
      realpathSync(request.repositoryPath),
      temporaryRoot
    );
    if (
      !isAbsolute(fromRepository) &&
      fromRepository !== ".." &&
      !fromRepository.startsWith(`..${sep}`)
    )
      return {
        status: "blocked" as const,
        reason: "A temporary directory outside the Repository is required.",
      };
    assertGovernedGitConfiguration(
      request.repositoryPath,
      Math.min(request.timeoutMs, 5000)
    );
    return { status: "supported" as const, temporaryRoot };
  } catch {
    return {
      status: "blocked" as const,
      reason:
        "Worker runtime requires Git without external filters, drivers, or conditional configuration.",
    };
  }
}
