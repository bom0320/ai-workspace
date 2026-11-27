import { rmSync } from "node:fs";
import {
  getAssignmentExecutionResults,
  getPreparedAssignmentPlan,
} from "@/application/governance/index.js";
import { recordWorkItemIntegration } from "@/application/governance/records/work-item-integrations/work-item-integration-records.js";
import {
  integratePatches,
  IntegrationError,
  readBoundPatch,
  type IntegrationPatch,
} from "../../shared/integrate-patches.js";
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
  let directory: string | undefined;
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
    const assignmentResults: WorkItemResult["assignmentResults"] = [];
    const writes: IntegrationPatch[] = [];
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
      const patch = readBoundPatch(
        artifacts,
        snapshot.commitSha,
        (report) =>
          (report.artifacts as { baseCommit?: string } | undefined)?.baseCommit
      );
      const { patchDigest, directory, resultDigest } = artifacts;
      if (!patchDigest) throw new Error("Missing patch digest.");
      writes.push({ ...result.integrationScope, patch });
      assignmentResults.push({
        ...reference,
        status: "write-completed",
        taskContractBinding: result.taskContractBinding,
        artifacts: { directory, patchDigest, resultDigest },
      });
      failure = "source";
    }
    const subject = { ...identity, snapshot, assignmentResults };
    if (!writes.length)
      return recordWorkItemIntegration(handoff, {
        ...subject,
        status: "read-integrated",
      });

    const integrated = await integratePatches(snapshot, writes, subject, () => {
      getPreparedAssignmentPlan(handoff, planId);
    });
    directory = integrated.artifacts.directory;
    const stored = recordWorkItemIntegration(handoff, {
      ...subject,
      status: "write-integrated",
      ...integrated,
    });
    if (
      stored.status === "write-integrated" &&
      stored.artifacts.directory !== directory
    )
      rmSync(directory, { recursive: true, force: true });
    return stored;
  } catch (error) {
    if (error instanceof IntegrationError) failure = error.failure;
    if (directory) {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        failure = "cleanup";
      }
    }
    return { ...identity, status: "failed", failure };
  }
}
