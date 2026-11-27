import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  applyWorkspacePatch,
  createExecutionWorkspace,
  getWorkspaceChangedPaths,
  removeExecutionWorkspace,
} from "@/infrastructure/git/index.js";
import {
  fingerprintExecutionArtifacts,
  preserveExecutionChanges,
  writeExecutionResult,
} from "@/services/artifacts/index.js";
import { checkGovernedWorkerRuntime } from "@/application/task-execution/index.js";
import { checkScope } from "@/services/scope/index.js";
import { verifyApprovedWorkspace } from "@/services/verification/index.js";
import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";

export type IntegrationFailure =
  | "source"
  | "artifact"
  | "workspace"
  | "patch"
  | "scope"
  | "verification"
  | "preservation"
  | "cleanup";

export type IntegrationPatch = {
  patch: Buffer;
  allowedPaths: string[];
  forbiddenPaths: string[];
  verification: string[];
  deadlineMs: number;
  exactPaths?: string[];
};

export class IntegrationError extends Error {
  constructor(public readonly failure: IntegrationFailure) {
    super(`Integration failed during ${failure}.`);
  }
}

export function readBoundPatch(
  artifacts: { directory: string; patchDigest?: string; resultDigest: string },
  commitSha: string,
  reportBase: (report: Record<string, unknown>) => string | undefined
) {
  const read = (name: string) => {
    const path = join(artifacts.directory, name);
    if (!lstatSync(path).isFile()) throw new Error("Invalid artifact file.");
    return readFileSync(path);
  };
  try {
    const digest = (bytes: Buffer) =>
      createHash("sha256").update(bytes).digest("hex");
    const patch = read("changes.patch");
    const report = read("result.json");
    if (
      !patch.length ||
      digest(patch) !== artifacts.patchDigest ||
      digest(report) !== artifacts.resultDigest ||
      read("base-commit.txt").toString("utf8") !== `${commitSha}\n` ||
      reportBase(JSON.parse(report.toString("utf8"))) !== commitSha
    )
      throw new Error("Artifact binding mismatch.");
    return patch;
  } catch {
    throw new IntegrationError("artifact");
  }
}

export async function integratePatches(
  snapshot: RepositorySnapshot,
  patches: readonly IntegrationPatch[],
  subject: object,
  assertCurrentSource: () => void
) {
  const { repositoryRoot, commitSha } = snapshot;
  const deadline = Math.min(...patches.map(({ deadlineMs }) => deadlineMs));
  const remaining = () => {
    const time = deadline - Date.now();
    if (time < 1) throw new Error("Integration deadline expired.");
    return time;
  };
  let failure: IntegrationFailure = "workspace";
  let workspace: string | undefined;
  let directory: string | undefined;
  let completed;
  try {
    if (
      ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"].some(
        (key) => process.env[key] !== undefined
      )
    )
      throw new Error("Integration requires an isolated Git environment.");
    const runtime = checkGovernedWorkerRuntime({
      repositoryPath: repositoryRoot,
      timeoutMs: remaining(),
    });
    if (runtime.status !== "supported") throw new Error(runtime.reason);
    workspace = createExecutionWorkspace(
      repositoryRoot,
      commitSha,
      remaining()
    );
    const allowed = new Set<string>();
    const commands = new Set<string>();
    for (const item of patches) {
      failure = "patch";
      const changed = applyWorkspacePatch(workspace, item.patch, remaining);
      failure = "scope";
      if (
        !changed.length ||
        !checkScope(changed, item.allowedPaths, item.forbiddenPaths).passed ||
        (item.exactPaths &&
          (changed.length !== item.exactPaths.length ||
            !changed.every((path) => item.exactPaths?.includes(path))))
      )
        throw new Error("Patch exceeds its approved scope.");
      changed.forEach((path) => allowed.add(path));
      item.verification.forEach((command) => commands.add(command));
    }
    const checkChangedPaths = (worktree: string) => {
      const paths = getWorkspaceChangedPaths(worktree, commitSha, remaining);
      if (!paths.length || !checkScope(paths, [...allowed], []).passed)
        throw new Error("Integrated changes exceed approved scope.");
      return paths;
    };
    checkChangedPaths(workspace);
    failure = "preservation";
    directory = mkdtempSync(
      join(runtime.temporaryRoot, "ai-workspace-integration-")
    );
    failure = "verification";
    const verification = await verifyApprovedWorkspace(
      [...commands],
      workspace,
      remaining,
      { directory, baseCommit: commitSha, staged: true }
    );
    if (!verification.passed)
      throw new Error("Integrated verification failed.");
    failure = "scope";
    const changedPaths = checkChangedPaths(workspace);
    failure = "source";
    assertCurrentSource();
    remaining();

    failure = "preservation";
    preserveExecutionChanges(workspace, directory, commitSha, { remaining });
    const report = {
      ...subject,
      status: "write-integrated",
      changedPaths,
      verification,
    };
    writeExecutionResult(directory, report);
    const artifacts = fingerprintExecutionArtifacts(directory, report);
    if (!artifacts.patchDigest)
      throw new Error("Missing integrated patch digest.");
    remaining();
    completed = {
      changedPaths,
      artifacts: { ...artifacts, patchDigest: artifacts.patchDigest },
    };
  } catch {
    // Cleanup precedes returning a successful result.
  }
  if (workspace) {
    try {
      removeExecutionWorkspace(repositoryRoot, workspace);
      if (completed) remaining();
    } catch {
      failure = "cleanup";
      completed = undefined;
    }
  }
  if (completed) return completed;
  if (directory) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      failure = "cleanup";
    }
  }
  throw new IntegrationError(failure);
}
