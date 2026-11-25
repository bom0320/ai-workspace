import { governanceDigest } from "@/services/governance-records/index.js";
import {
  resolveAssignmentExecution,
  bindAssignmentReadExecution,
} from "../../authorization/features/assignment-execution/flow/resolve-assignment-execution.js";
import { resolveApprovedDecision } from "../../approval/features/direction-review/flow/approved-decision.js";
import {
  AssignmentExecutionError,
  assignmentExecutionFailureStageSchema,
  type AssignmentExecutionFailureStage,
} from "../../model/assignment-execution.js";
import { withGovernanceLedger } from "../governance-transaction.js";
import { resolvePreparedAssignmentPlan } from "../assignment-plans/assignment-plan-records.js";
import type { Handoff } from "../assignment-plans/resolve-assignment-context.js";

// Terminal failure history uses the historical approval and reservation. It must
// still be writable when a current policy or Snapshot check caused the failure.
export function recordAssignmentFailure(
  handoff: Handoff,
  planId: string,
  id: string,
  failure: AssignmentExecutionFailureStage
) {
  const stage = assignmentExecutionFailureStageSchema.parse(failure);
  return withGovernanceLedger((ledger, save) => {
    const { entry, decision } = resolveApprovedDecision(
      ledger,
      handoff.decision.id
    );
    const record = entry.assignmentExecutions?.find(
      (value) => value.id === id && value.request.planId === planId
    );
    const delegation = entry.executionDelegations?.find(
      (value) => value.id === record?.delegationId
    );
    if (
      !record ||
      record.result ||
      record.failure ||
      delegation?.approvedDecisionId !== decision.id ||
      governanceDigest(delegation) !==
        governanceDigest({
          ...handoff.executionDelegation,
          status: delegation.status,
        }) ||
      governanceDigest(decision) !== governanceDigest(handoff.decision)
    )
      throw new AssignmentExecutionError("handoff");
    record.failure = {
      stage,
      digest: governanceDigest({ id, binding: record.binding, stage }),
    };
    save();
  });
}

export function getAssignmentExecutionResults(
  handoff: Handoff,
  planId: string
) {
  return withGovernanceLedger((ledger) => {
    const { entry, delegation, plan } = resolvePreparedAssignmentPlan(
      ledger,
      handoff,
      planId
    );
    type Reference = {
      assignmentId: string;
      workItemId: string;
      invocationId: string;
    } & (
      | { status: "read-completed"; resultDigest: string }
      | {
          status: "failed";
          failure: AssignmentExecutionFailureStage;
          failureRecorded: true;
        }
    );
    return (entry.assignmentExecutions ?? []).flatMap<Reference>((record) => {
      if (
        record.request.planId !== planId ||
        record.delegationId !== delegation.id
      )
        return [];
      if (record.failure) {
        const assignment = plan.assignments.find(
          ({ id }) => id === record.request.assignmentId
        );
        if (!assignment) throw new AssignmentExecutionError("handoff");
        return [
          {
            status: "failed",
            assignmentId: assignment.id,
            workItemId: assignment.workItemId,
            invocationId: record.id,
            failure: record.failure.stage,
            failureRecorded: true,
          },
        ];
      }
      if (!record.result) return [];
      const context = resolveAssignmentExecution(
        ledger,
        handoff,
        record.request
      );
      const { assignment } = context;
      const { binding } = bindAssignmentReadExecution(
        context,
        record.request,
        record.id
      );
      if (binding !== record.binding)
        throw new AssignmentExecutionError("handoff");
      return [
        {
          status: "read-completed" as const,
          assignmentId: assignment.id,
          workItemId: assignment.workItemId,
          invocationId: record.id,
          resultDigest: record.result.digest,
        },
      ];
    });
  });
}

export function getWorkerAssignmentPlanningContext(
  handoff: Handoff,
  planId: string,
  assignmentId: string
) {
  return withGovernanceLedger((ledger) => {
    const context = resolvePreparedAssignmentPlan(ledger, handoff, planId);
    const assignment = context.plan.assignments.find(
      ({ id }) => id === assignmentId
    );
    const workItem = context.decomposition.workItems.find(
      ({ id }) => id === assignment?.workItemId
    );
    if (assignment?.repositoryAccessCeiling !== "write" || !workItem)
      throw new AssignmentExecutionError("authority");
    if (workItem.dependsOn.length || assignment.dependsOn.length)
      throw new AssignmentExecutionError("dependency");
    return { assignment, workItem, priorResults: undefined };
  });
}
