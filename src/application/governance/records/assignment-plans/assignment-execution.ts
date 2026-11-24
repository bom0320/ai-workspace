import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  agentDecisionSchema,
  loadSnapshotFiles,
  validateDecisionEvidence,
} from "@/application/decision/index.js";
import { listRepositoryFilesAtCommit } from "@/infrastructure/git/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import {
  executionScopes,
  isExecutionScopeContained,
} from "../../approval/features/system-policy/model/execution-system-policy.js";
import { assignmentExecutionRequestSchema } from "../../model/assignment-execution.js";
import { withGovernanceLedger } from "../governance-transaction.js";
import { resolvePreparedAssignmentPlan } from "./assignment-plan-records.js";
import type { Handoff } from "./resolve-assignment-context.js";
import type { GovernanceLedger } from "../../model/ledger.js";

type Request = z.infer<typeof assignmentExecutionRequestSchema>;

export class AssignmentExecutionError extends Error {
  constructor(
    public readonly failure:
      | "authority"
      | "budget"
      | "duplicate"
      | "claim"
      | "dependency"
      | "validation"
      | "handoff"
  ) {
    super(`Collaborative Assignment failed at ${failure}.`);
  }
}

function resolveExecution(
  ledger: GovernanceLedger,
  handoff: Handoff,
  request: Request
) {
  const context = resolvePreparedAssignmentPlan(
    ledger,
    handoff,
    request.planId
  );
  const { entry, plan, delegation, policy, snapshot } = context;
  const assignment = plan.assignments.find(
    ({ id }) => id === request.assignmentId
  );
  if (assignment?.executor.kind !== "specialist")
    throw new AssignmentExecutionError("authority");
  const { specialistId } = assignment.executor;
  const specialist = context.specialistSources.find(
    ({ definition }) => definition.id === specialistId
  )?.definition;
  const workItem = context.decomposition.workItems.find(
    ({ id }) => id === assignment.workItemId
  );
  if (!specialist || !workItem) throw new AssignmentExecutionError("authority");
  // Work Item completion will be tracked separately once Workers can publish results.
  if (workItem.dependsOn.length)
    throw new AssignmentExecutionError("dependency");
  const requested = {
    readScopes: request.readPaths.map((path) => ({
      kind: "file" as const,
      path,
    })),
    writeScopes: [],
  };
  if (
    !isExecutionScopeContained(requested, executionScopes(delegation.grant)) ||
    !isExecutionScopeContained(requested, executionScopes(policy)) ||
    request.timeoutMs >
      Math.min(delegation.grant.budget.maxTimeoutMs, policy.budget.maxTimeoutMs)
  )
    throw new AssignmentExecutionError("authority");

  const predecessors = assignment.dependsOn.map((assignmentId) => {
    const record = entry.assignmentExecutions?.find(
      (item) =>
        item.request.planId === plan.id &&
        item.request.assignmentId === assignmentId &&
        item.delegationId === delegation.id
    );
    if (!record?.claimedAt || !record.result)
      throw new AssignmentExecutionError("dependency");
    return {
      assignmentId,
      invocationId: record.id,
      decision: record.result.decision,
    };
  });
  const binding = governanceDigest({
    request,
    delegation,
    snapshot,
    assignment,
    specialist,
    predecessors,
  });
  return { ...context, assignment, specialist, predecessors, binding };
}

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
    } = resolveExecution(ledger, handoff, request);
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
    if (!record || record.claimedAt)
      throw new AssignmentExecutionError("claim");
    const context = resolveExecution(ledger, handoff, record.request);
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

export function recordAssignmentResult(
  handoff: Handoff,
  planId: string,
  id: string,
  input: unknown
) {
  return withGovernanceLedger((ledger, save) => {
    const { entry } = resolvePreparedAssignmentPlan(ledger, handoff, planId);
    const record = entry.assignmentExecutions?.find(
      (value) => value.id === id && value.request.planId === planId
    );
    if (!record?.claimedAt || record.result)
      throw new AssignmentExecutionError("handoff");
    const context = resolveExecution(ledger, handoff, record.request);
    if (
      record.binding !== context.binding ||
      record.delegationId !== context.delegation.id
    )
      throw new AssignmentExecutionError("handoff");
    if (Date.now() >= Date.parse(record.claimedAt) + record.request.timeoutMs)
      throw new AssignmentExecutionError("validation");
    const decision = agentDecisionSchema.parse(input);
    if (
      decision.specialistId !== context.specialist.id ||
      !decision.evidence.length
    )
      throw new AssignmentExecutionError("validation");
    try {
      validateDecisionEvidence(
        {
          goal: context.goal,
          repositoryCommitSha: context.snapshot.commitSha,
          files: loadSnapshotFiles(context.snapshot, record.request.readPaths),
        },
        decision
      );
    } catch {
      throw new AssignmentExecutionError("validation");
    }
    if (Buffer.byteLength(JSON.stringify(decision)) > 64 * 1024)
      throw new AssignmentExecutionError("validation");
    record.result = {
      decision,
      digest: governanceDigest({ id, binding: record.binding, decision }),
    };
    save();
    return { invocationId: id, resultDigest: record.result.digest };
  });
}

export function getAssignmentExecutionResults(
  handoff: Handoff,
  planId: string
) {
  return withGovernanceLedger((ledger) => {
    const { entry, delegation } = resolvePreparedAssignmentPlan(
      ledger,
      handoff,
      planId
    );
    return (entry.assignmentExecutions ?? []).flatMap((record) => {
      if (
        record.request.planId !== planId ||
        record.delegationId !== delegation.id ||
        !record.result
      )
        return [];
      const { assignment, binding } = resolveExecution(
        ledger,
        handoff,
        record.request
      );
      if (binding !== record.binding)
        throw new AssignmentExecutionError("handoff");
      return [
        {
          status: "completed" as const,
          assignmentId: assignment.id,
          workItemId: assignment.workItemId,
          invocationId: record.id,
          resultDigest: record.result.digest,
        },
      ];
    });
  });
}
