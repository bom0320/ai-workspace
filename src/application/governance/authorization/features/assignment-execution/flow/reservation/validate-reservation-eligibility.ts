import {
  AssignmentExecutionError,
  type AssignmentExecutionRequest,
} from "../../../../../model/assignment-execution.js";
import type { resolveAssignmentExecution } from "../context/resolve-assignment-execution.js";

export function validateReservationEligibility(
  context: ReturnType<typeof resolveAssignmentExecution>,
  request: AssignmentExecutionRequest
) {
  const { entry, delegation, policy, assignment } = context;
  if (
    assignment.repositoryAccessCeiling === "write" &&
    context.plan.writeDetailingVersion !== 1
  )
    throw new AssignmentExecutionError("legacy-write-plan");
  const prior = entry.assignmentExecutions ?? [];
  const workReservations = entry.executionReservations ?? [];
  if (
    prior.some(({ request: reserved, delegationId }) => {
      if (delegationId !== delegation.id) return false;
      if (reserved.planId === request.planId)
        return (
          reserved.assignmentId === request.assignmentId &&
          reserved.access === request.access
        );
      return entry.assignmentPlans?.some(
        (plan) =>
          plan.id === reserved.planId &&
          plan.assignments.some(
            (item) =>
              item.id === reserved.assignmentId &&
              item.workItemId === assignment.workItemId
          )
      );
    }) ||
    workReservations.some(
      ({ sourceId, delegationId }) =>
        delegationId === delegation.id &&
        entry.workItemExecutionSources?.some(
          (source) =>
            source.id === sourceId &&
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
    Math.min(policy.budget.maxExecutions, delegation.grant.budget.maxExecutions)
  )
    throw new AssignmentExecutionError("budget");

  const now = Date.now();
  if (now + request.timeoutMs > Date.parse(delegation.grant.expiresAt))
    throw new AssignmentExecutionError("authority");
  return now;
}
