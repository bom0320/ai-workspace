import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative, sep } from "node:path";
import type { ExecutionRequest } from "@/application/governance/index.js";
import { assertGovernedGitConfiguration } from "@/infrastructure/git/index.js";

export function checkGovernedWorkerRuntime(request: ExecutionRequest) {
  const apiKey = process.env.AI_WORKSPACE_GOVERNED_OPENAI_API_KEY?.trim();
  if (!apiKey || !/^[!-~]+$/.test(apiKey) || process.platform === "win32")
    return {
      status: "blocked" as const,
      reason:
        "Worker runtime cannot enforce the grant without a configured tool-free transport on a supported host.",
    };
  if (
    !request.task.allowedPaths.every(
      (path) =>
        request.readPaths.includes(path) &&
        !/(?:^|\/)[.]git(?:attributes|modules|ignore)(?:\/|$)/i.test(path)
    ) ||
    request.task.verification.some(
      (command) => command !== "git diff --check"
    ) ||
    request.timeoutMs > 2_147_483_647
  )
    return {
      status: "blocked" as const,
      reason:
        "Worker runtime cannot enforce this file, command or timeout grant.",
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
    return { status: "supported" as const, apiKey, temporaryRoot };
  } catch {
    return {
      status: "blocked" as const,
      reason:
        "Worker runtime requires Git without external filters, drivers, or conditional configuration.",
    };
  }
}
