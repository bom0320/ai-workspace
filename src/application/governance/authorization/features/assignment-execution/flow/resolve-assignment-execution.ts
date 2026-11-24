import { governanceDigest } from "@/services/governance-records/index.js";
import { resolvePreparedAssignmentPlan } from "../../../../records/assignment-plans/assignment-plan-records.js";
import type { Handoff } from "../../../../records/assignment-plans/resolve-assignment-context.js";
import {
  executionScopes,
  isExecutionScopeContained,
} from "../../../../approval/features/system-policy/model/execution-system-policy.js";
import {
  AssignmentExecutionError,
  type AssignmentExecutionRequest,
} from "../../../../model/assignment-execution.js";
import type { GovernanceLedger } from "../../../../model/ledger.js";

export function resolveAssignmentExecution(
  ledger: GovernanceLedger,
  handoff: Handoff,
  request: AssignmentExecutionRequest
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
  // Only read-only Work Items have a complete result contract in this path.
  const workItemPredecessors = workItem.dependsOn.map((workItemId) => {
    const predecessor = context.decomposition.workItems.find(
      ({ id }) => id === workItemId
    );
    const assignments = plan.assignments.filter(
      (item) => item.workItemId === workItemId
    );
    if (predecessor?.workType !== "read-only" || !assignments.length)
      throw new AssignmentExecutionError("dependency");
    return {
      workItemId,
      results: assignments.map(({ id }) => {
        const record = entry.assignmentExecutions?.find(
          (item) =>
            item.request.planId === plan.id &&
            item.request.assignmentId === id &&
            item.delegationId === delegation.id
        );
        if (!record?.claimedAt || !record.result)
          throw new AssignmentExecutionError("dependency");
        return { invocationId: record.id, digest: record.result.digest };
      }),
    };
  });
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
    ...(workItemPredecessors.length && { workItemPredecessors }),
  });
  return { ...context, assignment, specialist, predecessors, binding };
}
