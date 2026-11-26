import { resolvePreparedAssignmentPlan } from "../../../../../records/assignment-plans/assignment-plan-records.js";
import {
  executionScopes,
  isExecutionScopeContained,
} from "../../../../../approval/features/system-policy/model/execution-system-policy.js";
import {
  AssignmentExecutionError,
  type AssignmentExecutionRequest,
} from "../../../../../model/assignment-execution.js";
import type { GovernanceLedger } from "../../../../../model/ledger.js";
import type { Handoff } from "../../../../../records/assignment-plans/prepare-assignment-context.js";

export function resolveAssignmentExecution(
  ledger: GovernanceLedger,
  handoff: Handoff,
  request: AssignmentExecutionRequest
) {
  return resolveAssignmentBinding(
    resolvePreparedAssignmentPlan(ledger, handoff, request.planId),
    request
  );
}

type PlanContext = ReturnType<typeof resolvePreparedAssignmentPlan>;

export function resolveAssignmentBinding(
  context: PlanContext,
  request: AssignmentExecutionRequest
) {
  const { plan, delegation, policy, snapshot } = context;

  const assignment = plan.assignments.find(
    ({ id }) => id === request.assignmentId
  );
  if (
    plan.id !== request.planId ||
    !assignment ||
    (request.access === "write" &&
      assignment.repositoryAccessCeiling !== "write")
  )
    throw new AssignmentExecutionError("authority");
  const { specialistId } = assignment;
  const specialist = context.specialistSources.find(
    ({ definition }) => definition.id === specialistId
  )?.definition;
  const workItem = context.decomposition.workItems.find(
    ({ id }) => id === assignment.workItemId
  );
  if (
    !specialist ||
    !workItem ||
    !context.synthesisProposal.direction.text.trim()
  )
    throw new AssignmentExecutionError("authority");
  const requested = {
    readScopes:
      request.access === "read"
        ? request.readScopes
        : request.readPaths.map((path) => ({ kind: "file" as const, path })),
    writeScopes: [],
  };
  if (
    (request.access === "read" &&
      request.initialReadPaths &&
      !isExecutionScopeContained(
        {
          readScopes: request.initialReadPaths.map((path) => ({
            kind: "file",
            path,
          })),
          writeScopes: [],
        },
        requested
      )) ||
    !isExecutionScopeContained(requested, executionScopes(delegation.grant)) ||
    !isExecutionScopeContained(requested, executionScopes(policy)) ||
    request.timeoutMs >
      Math.min(delegation.grant.budget.maxTimeoutMs, policy.budget.maxTimeoutMs)
  )
    throw new AssignmentExecutionError("authority");

  return { ...context, assignment, workItem, specialist };
}

export function assertAssignmentReadDependencies({
  workItem,
  assignment,
}: ReturnType<typeof resolveAssignmentExecution>) {
  // Read execution results cannot satisfy Assignment or Work Item dependencies.
  if (workItem.dependsOn.length || assignment.dependsOn.length)
    throw new AssignmentExecutionError("dependency");
}
