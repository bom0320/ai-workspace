import { validateTaskExecutionContract } from "../../../validate-task-execution-contract.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { resolvePreparedAssignmentPlan } from "../../../../records/assignment-plans/assignment-plan-records.js";
import type { Handoff } from "../../../../records/assignment-plans/prepare-assignment-context.js";
import {
  executionScopes,
  isExecutionScopeContained,
} from "../../../../approval/features/system-policy/model/execution-system-policy.js";
import {
  AssignmentExecutionError,
  assignmentDelegationBinding,
  authorizedAssignmentReadExecutionSchema,
  authorizedAssignmentWriteExecutionSchema,
  isAssignmentReadRecord,
  type AssignmentExecutionRequest,
} from "../../../../model/assignment-execution.js";
import type { GovernanceLedger } from "../../../../model/ledger.js";

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

export function bindAssignmentReadExecution(
  context: ReturnType<typeof resolveAssignmentExecution>,
  request: Extract<AssignmentExecutionRequest, { access: "read" }>,
  id: string
) {
  const execution = authorizedAssignmentReadExecutionSchema.parse({
    ...request,
    id,
    specialistId: context.specialist.id,
    authority: { repositoryAccess: "read", shellExecution: false },
    snapshot: context.snapshot,
    delegationId: context.delegation.id,
    delegationBinding: assignmentDelegationBinding(context.delegation),
    policyBinding: context.policyBinding,
    expiresAt: context.delegation.grant.expiresAt,
  });
  return { execution, binding: governanceDigest({ request, execution }) };
}

export function bindAssignmentWriteExecution(
  context: ReturnType<typeof resolveAssignmentExecution>,
  request: Extract<AssignmentExecutionRequest, { access: "write" }>,
  id: string
) {
  const { entry, delegation, policy, assignment, plan, snapshot } = context;
  if (plan.writeDetailingVersion !== 1)
    throw new AssignmentExecutionError("legacy-write-plan");
  const source = entry.assignmentExecutions
    ?.filter(isAssignmentReadRecord)
    .find(
      (record) =>
        record.request.planId === plan.id &&
        record.request.assignmentId === assignment.id &&
        record.delegationId === delegation.id
    );
  const prepared = source?.result;
  if (
    !source?.claimedAt ||
    !prepared ||
    !("status" in prepared) ||
    prepared.taskContractBinding !== request.taskContractBinding
  )
    throw new AssignmentExecutionError("validation");
  if (!prepared.task.implementationPlan)
    throw new AssignmentExecutionError("legacy-write-plan");
  if (
    delegation.grant.workerMode !== "codex-worktree" ||
    policy.workerMode !== "codex-worktree"
  )
    throw new AssignmentExecutionError("unsupported");
  const task = prepared.task;
  try {
    validateTaskExecutionContract(task, delegation.grant);
    validateTaskExecutionContract(task, policy);
  } catch {
    throw new AssignmentExecutionError("validation");
  }
  const execution = authorizedAssignmentWriteExecutionSchema.parse({
    ...request,
    id,
    preparedInvocationId: source.id,
    specialistId: context.specialist.id,
    snapshot,
    delegationId: delegation.id,
    delegationBinding: assignmentDelegationBinding(delegation),
    policyBinding: context.policyBinding,
    expiresAt: delegation.grant.expiresAt,
    authority: { repositoryAccess: "write", shellExecution: true },
    workerMode: "codex-worktree",
    writePaths: task.allowedPaths,
    verification: task.verification,
  });
  return { task, execution, binding: governanceDigest({ request, execution }) };
}
