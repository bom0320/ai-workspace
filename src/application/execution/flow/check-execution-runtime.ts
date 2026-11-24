import { accessSync, constants, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative, sep } from "node:path";
import { assertGovernedGitConfiguration } from "@/infrastructure/git/index.js";

type RuntimeInput = { repositoryPath: string; timeoutMs: number };

export function checkGovernedWorkerRuntime(request: RuntimeInput) {
  if (process.platform === "win32")
    return {
      status: "blocked" as const,
      reason: "The Codex Worktree runtime does not support this host.",
    };

  return checkContextEnvironment(request, "worktree");
}

export function checkReadOnlyRuntime(request: RuntimeInput) {
  if (process.platform !== "darwin" && process.platform !== "linux")
    return {
      status: "blocked" as const,
      reason: "The context-only Specialist runtime does not support this host.",
    };

  return checkContextEnvironment(request, "read-only");
}

// Both runtimes read Git and need a writable temporary root outside the Repository.
function checkContextEnvironment(
  request: RuntimeInput,
  operation: "worktree" | "read-only"
) {
  const runtime =
    operation === "worktree" ? "Codex Worktree" : "context-only Specialist";
  if (request.timeoutMs > 2_147_483_647)
    return {
      status: "blocked" as const,
      reason: `The ${runtime} timeout exceeds the supported limit.`,
    };

  try {
    const temporaryRoot = realpathSync(tmpdir());
    accessSync(temporaryRoot, constants.W_OK | constants.X_OK);
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
    try {
      assertGovernedGitConfiguration(
        request.repositoryPath,
        Math.min(request.timeoutMs, 5000),
        operation
      );
    } catch {
      return {
        status: "blocked" as const,
        reason:
          "Execution requires Git without external filters, drivers, or conditional configuration.",
      };
    }
    return { status: "supported" as const, temporaryRoot };
  } catch {
    return {
      status: "blocked" as const,
      reason: `The ${runtime} requires an accessible isolated temporary directory.`,
    };
  }
}
