import { governanceDigest } from "@/services/governance-records/index.js";
import { validateTaskExecutionContract } from "../../../../validate-task-execution-contract.js";
import {
  AssignmentExecutionError,
  assignmentDelegationBinding,
  authorizedAssignmentReadExecutionSchema,
  authorizedAssignmentWriteExecutionSchema,
  isAssignmentReadRecord,
  type AssignmentExecutionRequest,
} from "../../../../../model/assignment-execution.js";
import type { resolveAssignmentExecution } from "../context/resolve-assignment-execution.js";

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
