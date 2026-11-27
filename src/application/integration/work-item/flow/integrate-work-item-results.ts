import { governanceDigest } from "@/services/governance-records/index.js";
import { getRecordedWorkItemIntegrations } from "@/application/governance/index.js";
import {
  integratePatches,
  IntegrationError,
  readBoundPatch,
  type IntegrationPatch,
} from "../../shared/integrate-patches.js";
import type { WorkItemIntegrationInput } from "../data-flow/input.js";
import type {
  WorkItemIntegrationOutput,
  WorkItemResultReference,
} from "../data-flow/output.js";

export async function integrateWorkItemResults({
  handoff,
  planId,
}: WorkItemIntegrationInput): Promise<WorkItemIntegrationOutput> {
  try {
    const { plan, integrations, failedWorkItemIds } =
      getRecordedWorkItemIntegrations(handoff, planId);
    const { snapshot, selectedWorkItemIds } = plan;
    if (
      plan.id !== planId ||
      !selectedWorkItemIds.length ||
      new Set(selectedWorkItemIds).size !== selectedWorkItemIds.length ||
      integrations.some(
        ({ result }) =>
          result.planId !== planId ||
          !selectedWorkItemIds.includes(result.workItemId) ||
          governanceDigest(result.snapshot) !== governanceDigest(snapshot)
      )
    )
      throw new IntegrationError("source");
    const byWorkItem = new Map(
      integrations.map((entry) => [entry.result.workItemId, entry])
    );
    if (byWorkItem.size !== integrations.length)
      throw new IntegrationError("source");
    const missingWorkItemIds = selectedWorkItemIds.filter(
      (id) => !byWorkItem.has(id)
    );
    if (missingWorkItemIds.some((id) => failedWorkItemIds.includes(id)))
      throw new IntegrationError("source");
    if (missingWorkItemIds.length)
      return { status: "pending", planId, missingWorkItemIds };
    const workItemResults: WorkItemResultReference[] = [];
    const patches: IntegrationPatch[] = [];
    for (const workItemId of selectedWorkItemIds) {
      const { result, digest, scopes } = byWorkItem.get(workItemId)!;
      workItemResults.push({ workItemId, digest, status: result.status });
      if (result.status === "read-integrated") continue;
      const patch = readBoundPatch(
        result.artifacts,
        snapshot.commitSha,
        (report) => {
          if (
            report.planId !== planId ||
            report.workItemId !== workItemId ||
            report.status !== result.status ||
            governanceDigest(report.snapshot ?? null) !==
              governanceDigest(snapshot) ||
            governanceDigest(report.assignmentResults ?? null) !==
              governanceDigest(result.assignmentResults) ||
            governanceDigest(report.changedPaths ?? null) !==
              governanceDigest(result.changedPaths) ||
            (report.verification as { passed?: boolean } | undefined)
              ?.passed !== true
          )
            return undefined;
          return (report.snapshot as { commitSha?: string } | undefined)
            ?.commitSha;
        }
      );
      // Governance checks each recorded path against at least one of this
      // Work Item's Assignment contracts, including its forbidden paths.
      if (!scopes.length) throw new IntegrationError("source");
      patches.push({
        patch,
        allowedPaths: result.changedPaths,
        forbiddenPaths: [],
        exactPaths: result.changedPaths,
        verification: scopes.flatMap(({ verification }) => verification),
        deadlineMs: Math.min(...scopes.map(({ deadlineMs }) => deadlineMs)),
      });
    }
    const subject = { planId, snapshot, workItemResults };
    if (!patches.length) return { ...subject, status: "read-integrated" };
    const integrated = await integratePatches(
      snapshot,
      patches,
      subject,
      () => {
        const current = getRecordedWorkItemIntegrations(handoff, planId);
        const digests = new Set(
          current.integrations.map(({ digest }) => digest)
        );
        if (!workItemResults.every(({ digest }) => digests.has(digest)))
          throw new Error("Work Item provenance changed.");
      }
    );
    return { ...subject, status: "write-integrated", ...integrated };
  } catch (error) {
    return {
      planId,
      status: "failed",
      failure: error instanceof IntegrationError ? error.failure : "source",
    };
  }
}
