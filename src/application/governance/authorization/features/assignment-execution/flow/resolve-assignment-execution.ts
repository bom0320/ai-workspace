import { governanceDigest } from "@/services/governance-records/index.js";
import { resolvePreparedAssignmentPlan } from "../../../../records/assignment-plans/assignment-plan-records.js";
import type { Handoff } from "../../../../records/assignment-plans/resolve-assignment-context.js";
import {
  executionScopes,
  isExecutionScopeContained,
} from "../../../../approval/features/system-policy/model/execution-system-policy.js";
import {
  AssignmentExecutionError,
  assignmentDelegationBinding,
  authorizedAssignmentReadExecutionSchema,
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
    request,
    new Set()
  );
}

type PlanContext = ReturnType<typeof resolvePreparedAssignmentPlan>;

function resolveAssignmentBinding(
  context: PlanContext,
  request: AssignmentExecutionRequest,
  verified: Set<string>
) {
  const { plan, delegation, policy, snapshot } = context;

  const assignment = plan.assignments.find(
    ({ id }) => id === request.assignmentId
  );
  if (
    !assignment ||
    (request.access === "write" &&
      assignment.repositoryAccessCeiling !== "write")
  )
    throw new AssignmentExecutionError("authority");
  if (request.access === "write")
    throw new AssignmentExecutionError("unsupported");
  const { specialistId } = assignment;
  const specialist = context.specialistSources.find(
    ({ definition }) => definition.id === specialistId
  )?.definition;
  const workItem = context.decomposition.workItems.find(
    ({ id }) => id === assignment.workItemId
  );
  if (!specialist || !workItem || !context.approvedDirection?.trim())
    throw new AssignmentExecutionError("authority");
  const requested = { readScopes: request.readScopes, writeScopes: [] };
  if (
    !isExecutionScopeContained(requested, executionScopes(delegation.grant)) ||
    !isExecutionScopeContained(requested, executionScopes(policy)) ||
    request.timeoutMs >
      Math.min(delegation.grant.budget.maxTimeoutMs, policy.budget.maxTimeoutMs)
  )
    throw new AssignmentExecutionError("authority");

  const { predecessors, workItemPredecessors } = resolvePredecessorResults(
    context,
    workItem.dependsOn,
    assignment.dependsOn,
    verified
  );
  return {
    ...context,
    assignment,
    workItem,
    specialist,
    predecessors,
    workItemPredecessors,
  };
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

type ExecutionRecord = NonNullable<
  PlanContext["entry"]["assignmentExecutions"]
>[number];

function verifiedAssignmentResult(
  context: PlanContext,
  assignmentId: string,
  verified: Set<string>
): ExecutionRecord & { result: NonNullable<ExecutionRecord["result"]> } {
  const record = context.entry.assignmentExecutions?.find(
    (item) =>
      item.request.planId === context.plan.id &&
      item.request.assignmentId === assignmentId &&
      item.delegationId === context.delegation.id
  );
  if (!record?.claimedAt || !record.result || record.failure)
    throw new AssignmentExecutionError("dependency");
  const { result } = record;
  if (!verified.has(record.id)) {
    const resolved = resolveAssignmentBinding(
      context,
      record.request,
      verified
    );
    const { binding } = bindAssignmentReadExecution(
      resolved,
      record.request,
      record.id
    );
    if (
      binding !== record.binding ||
      governanceDigest({
        id: record.id,
        binding,
        decision: result.decision,
      }) !== result.digest
    )
      throw new AssignmentExecutionError("handoff");
    verified.add(record.id);
  }
  return { ...record, result };
}

export function resolvePredecessorResults(
  context: PlanContext,
  dependsOn: readonly string[],
  assignmentDependencies: readonly string[],
  verified = new Set<string>()
) {
  if (dependsOn.length) throw new AssignmentExecutionError("dependency");
  const workItemPredecessors: {
    workItemId: string;
    results: {
      assignmentId: string;
      invocationId: string;
      digest: string;
      decision: NonNullable<ExecutionRecord["result"]>["decision"];
    }[];
  }[] = [];
  const predecessors = assignmentDependencies.map((assignmentId) => {
    const record = verifiedAssignmentResult(context, assignmentId, verified);
    return {
      assignmentId,
      invocationId: record.id,
      decision: record.result.decision,
    };
  });
  return { predecessors, workItemPredecessors };
}
