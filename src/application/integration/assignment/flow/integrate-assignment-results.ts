import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  getAssignmentExecutionResults,
  getPreparedAssignmentPlan,
} from "@/application/governance/index.js";
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
import type { AssignmentIntegrationInput } from "../data-flow/input.js";
import type {
  AssignmentIntegrationOutput,
  WorkItemResult,
} from "../data-flow/output.js";

export async function integrateAssignmentResults({
  handoff,
  planId,
  workItemId,
}: AssignmentIntegrationInput): Promise<AssignmentIntegrationOutput> {
  const identity = { planId, workItemId };
  let failure: Extract<
    AssignmentIntegrationOutput,
    { status: "failed" }
  >["failure"] = "source";
  let workspace: string | undefined;
  let directory: string | undefined;
  let repositoryRoot: string | undefined;
  let completed: WorkItemResult | undefined;
  try {
    const { plan } = getPreparedAssignmentPlan(handoff, planId);
    const required = plan.assignments.filter(
      (assignment) => assignment.workItemId === workItemId
    );
    if (!plan.selectedWorkItemIds.includes(workItemId) || !required.length)
      throw new Error("Work Item is not part of the registered Plan.");
    const results = getAssignmentExecutionResults(handoff, planId, {
      includeIntegrationScope: true,
    });
    const { snapshot } = plan;
    repositoryRoot = snapshot.repositoryRoot;
    const assignmentResults: WorkItemResult["assignmentResults"] = [];
    type WriteResult = Extract<
      (typeof results)[number],
      { status: "write-completed" }
    >;
    const writes: {
      integrationScope: NonNullable<WriteResult["integrationScope"]>;
      patch: Buffer;
    }[] = [];
    for (const assignment of required) {
      const matches = results.filter(
        (result) =>
          result.assignmentId === assignment.id &&
          result.workItemId === workItemId
      );
      if (matches.length > 1) throw new Error("Ambiguous Assignment result.");
      const result = matches[0];
      if (result?.status === "failed" || result?.status === "denied")
        return {
          ...identity,
          status: "failed",
          failure:
            result.status === "failed" &&
            result.failure === "handoff" &&
            !result.failureRecorded
              ? "artifact"
              : "source",
        };
      if (!result || result.status === "task-prepared")
        return { ...identity, status: "pending" };
      const reference = {
        assignmentId: assignment.id,
        invocationId: result.invocationId,
        resultDigest: result.resultDigest,
      };
      if (
        assignment.repositoryAccessCeiling === "read" &&
        result.status === "read-completed"
      ) {
        assignmentResults.push({ ...reference, status: "read-completed" });
        continue;
      }
      if (
        assignment.repositoryAccessCeiling !== "write" ||
        result.status !== "write-completed" ||
        !result.integrationScope
      )
        throw new Error(
          "Assignment result does not match the registered access ceiling."
        );
      failure = "artifact";
      const artifacts = result.artifacts;
      const patchPath = join(artifacts.directory, "changes.patch");
      if (!lstatSync(patchPath).isFile())
        throw new Error("Invalid patch file.");
      const patch = readFileSync(patchPath);
      if (
        !patch.length ||
        createHash("sha256").update(patch).digest("hex") !==
          artifacts.patchDigest
      )
        throw new Error("Patch digest mismatch.");
      const basePath = join(artifacts.directory, "base-commit.txt");
      if (
        !lstatSync(basePath).isFile() ||
        readFileSync(basePath, "utf8") !== `${snapshot.commitSha}\n`
      )
        throw new Error("Patch base does not match the registered snapshot.");
      const report = readFileSync(join(artifacts.directory, "result.json"));
      if (
        createHash("sha256").update(report).digest("hex") !==
          artifacts.resultDigest ||
        JSON.parse(report.toString("utf8")).artifacts?.baseCommit !==
          snapshot.commitSha
      )
        throw new Error(
          "Recorded execution report does not match the snapshot."
        );
      const { patchDigest, directory, resultDigest } = artifacts;
      if (!patchDigest) throw new Error("Missing patch digest.");
      writes.push({ integrationScope: result.integrationScope, patch });
      assignmentResults.push({
        ...reference,
        status: "write-completed",
        taskContractBinding: result.taskContractBinding,
        artifacts: { directory, patchDigest, resultDigest },
      });
      failure = "source";
    }
    const subject = { ...identity, snapshot, assignmentResults };
    if (!writes.length) return { ...subject, status: "read-integrated" };

    const deadline = Math.min(
      ...writes.map(({ integrationScope }) => integrationScope.deadlineMs)
    );
    const remaining = () => {
      const time = deadline - Date.now();
      if (time < 1) throw new Error("Integration deadline expired.");
      return time;
    };
    failure = "workspace";
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
      snapshot.commitSha,
      remaining()
    );
    const allowed = new Set<string>();
    const commands = new Set<string>();
    for (const { patch, integrationScope } of writes) {
      failure = "patch";
      const changed = applyWorkspacePatch(workspace, patch, remaining);
      failure = "scope";
      if (
        !changed.length ||
        !checkScope(
          changed,
          integrationScope.allowedPaths,
          integrationScope.forbiddenPaths
        ).passed
      )
        throw new Error("Assignment patch exceeds its approved scope.");
      changed.forEach((path) => allowed.add(path));
      integrationScope.verification.forEach((command) => commands.add(command));
    }
    let changedPaths = getWorkspaceChangedPaths(workspace, snapshot.commitSha);
    if (
      !changedPaths.length ||
      !checkScope(changedPaths, [...allowed], []).passed
    )
      throw new Error("Integrated change exceeds the approved scope.");

    failure = "preservation";
    directory = mkdtempSync(
      join(runtime.temporaryRoot, "ai-workspace-integration-")
    );
    failure = "verification";
    const verification = await verifyApprovedWorkspace(
      [...commands],
      workspace,
      remaining,
      {
        directory,
        baseCommit: snapshot.commitSha,
        staged: true,
      }
    );
    if (!verification.passed)
      throw new Error("Integrated verification failed.");

    failure = "scope";
    changedPaths = getWorkspaceChangedPaths(workspace, snapshot.commitSha);
    if (
      !changedPaths.length ||
      !checkScope(changedPaths, [...allowed], []).passed
    )
      throw new Error(
        "Integrated change exceeds the approved scope after verification."
      );
    failure = "source";
    getPreparedAssignmentPlan(handoff, planId);
    remaining();

    failure = "preservation";
    preserveExecutionChanges(workspace, directory, snapshot.commitSha, {
      remaining,
    });
    const report = {
      ...subject,
      status: "write-integrated" as const,
      changedPaths,
      verification,
    };
    writeExecutionResult(directory, report);
    const artifacts = fingerprintExecutionArtifacts(directory, report);
    if (!artifacts.patchDigest)
      throw new Error("Missing integrated patch digest.");
    remaining();
    completed = {
      ...subject,
      status: "write-integrated",
      artifacts: { ...artifacts, patchDigest: artifacts.patchDigest },
    };
  } catch {
    // An incomplete workspace or artifact is never published as an integrated result.
  }
  if (workspace && repositoryRoot) {
    try {
      removeExecutionWorkspace(repositoryRoot, workspace);
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
  return { ...identity, status: "failed", failure };
}
