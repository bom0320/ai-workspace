import { randomUUID } from "node:crypto";
import { loadSnapshotFiles } from "@/application/decision/index.js";
import { listRepositoryFilesAtCommit } from "@/infrastructure/git/index.js";
import {
  AssignmentExecutionError,
  assignmentExecutionRequestSchema,
} from "../../../../model/assignment-execution.js";
import { withGovernanceLedger } from "../../../../records/governance-transaction.js";
import { resolvePreparedAssignmentPlan } from "../../../../records/assignment-plans/assignment-plan-records.js";
import type { Handoff } from "../../../../records/assignment-plans/resolve-assignment-context.js";
import { resolveAssignmentExecution } from "./resolve-assignment-execution.js";

export function reserveAssignmentExecution(handoff: Handoff, input: unknown) {
  const request = assignmentExecutionRequestSchema.parse(input);
  return withGovernanceLedger((ledger, save) => {
    const {
      entry,
      delegation,
      policy,
      binding,
      snapshot,
      decomposition,
      assignment,
    } = resolveAssignmentExecution(ledger, handoff, request);
    const prior = entry.assignmentExecutions ?? [];
    const workReservations = entry.executionReservations ?? [];
    if (
      prior.some(
        (value) =>
          value.request.planId === request.planId &&
          value.request.assignmentId === request.assignmentId
      ) ||
      workReservations.some(({ sourceId }) =>
        entry.workItemExecutionSources?.some(
          (source) =>
            source.id === sourceId &&
            source.decompositionBinding === decomposition.binding &&
            source.workItemId === assignment.workItemId
        )
      )
    )
      throw new AssignmentExecutionError("duplicate");

    const count = [...prior, ...workReservations].filter(
      ({ delegationId }) => delegationId === delegation.id
    ).length;
    if (
      count >=
      Math.min(
        policy.budget.maxExecutions,
        delegation.grant.budget.maxExecutions
      )
    )
      throw new AssignmentExecutionError("budget");
    const remaining = Date.parse(delegation.grant.expiresAt) - Date.now();
    if (request.timeoutMs > remaining)
      throw new AssignmentExecutionError("authority");
    const files = listRepositoryFilesAtCommit(
      snapshot.repositoryRoot,
      snapshot.commitSha
    );
    let bytes = 0;
    for (const path of request.readPaths) {
      const file = files.find((entry) => entry.path === path);
      if (file?.size == null || !["100644", "100755"].includes(file.mode))
        throw new AssignmentExecutionError("authority");
      bytes += file.size;
    }
    if (bytes > 64 * 1024) throw new AssignmentExecutionError("authority");
    const id = randomUUID();
    (entry.assignmentExecutions ??= []).push({
      id,
      delegationId: delegation.id,
      request,
      binding,
      reservedAt: new Date().toISOString(),
    });
    save();
    return id;
  });
}

export function claimAssignmentExecution(
  handoff: Handoff,
  planId: string,
  id: string
) {
  return withGovernanceLedger((ledger, save) => {
    const { entry } = resolvePreparedAssignmentPlan(ledger, handoff, planId);
    const record = entry.assignmentExecutions?.find(
      (value) => value.id === id && value.request.planId === planId
    );
    if (!record || record.claimedAt || record.failure)
      throw new AssignmentExecutionError("claim");
    const context = resolveAssignmentExecution(ledger, handoff, record.request);
    if (
      record.binding !== context.binding ||
      record.delegationId !== context.delegation.id
    )
      throw new AssignmentExecutionError("claim");
    const expiresAt = Date.parse(context.delegation.grant.expiresAt);
    if (Date.now() + record.request.timeoutMs > expiresAt)
      throw new AssignmentExecutionError("claim");
    const files = loadSnapshotFiles(context.snapshot, record.request.readPaths);
    if (
      Buffer.byteLength(
        JSON.stringify({ files, predecessors: context.predecessors })
      ) >
      64 * 1024
    )
      throw new AssignmentExecutionError("validation");
    record.claimedAt = new Date().toISOString();
    save();
    return {
      snapshot: context.snapshot,
      goal: context.goal,
      assignment: context.assignment,
      specialist: context.specialist,
      predecessors: context.predecessors,
      files,
      expiresAt,
      timeoutMs: record.request.timeoutMs,
    };
  });
}
