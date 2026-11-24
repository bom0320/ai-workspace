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
