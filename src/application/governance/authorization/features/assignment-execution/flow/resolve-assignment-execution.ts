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
  if (assignment?.repositoryAccessCeiling !== "read")
    throw new AssignmentExecutionError("authority");
  const { specialistId } = assignment;
  const specialist = context.specialistSources.find(
    ({ definition }) => definition.id === specialistId
  )?.definition;
  const approvedRegistration = context.approvedSources.find(
    ({ definition }) => definition.id === specialistId
  )?.definition;
  const workItem = context.decomposition.workItems.find(
    ({ id }) => id === assignment.workItemId
  );
  if (
    !specialist ||
    !approvedRegistration ||
    !workItem ||
    !context.approvedDirection?.trim()
  )
    throw new AssignmentExecutionError("authority");
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

  const { predecessors, workItemPredecessors } = resolvePredecessorResults(
    context,
    workItem.dependsOn,
    assignment.dependsOn,
    verified
  );
  const binding = governanceDigest({
    request,
    delegation,
    snapshot,
    assignment,
    specialist: approvedRegistration,
    predecessors,
    ...(workItemPredecessors.length && {
      workItemPredecessors: workItemPredecessors.map(
        ({ workItemId, results }) => ({
          workItemId,
          results: results.map(({ invocationId, digest }) => ({
            invocationId,
            digest,
          })),
        })
      ),
    }),
  });
  return {
    ...context,
    assignment,
    workItem,
    specialist,
    predecessors,
    workItemPredecessors,
    binding,
  };
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
    const { binding } = resolveAssignmentBinding(
      context,
      record.request,
      verified
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
