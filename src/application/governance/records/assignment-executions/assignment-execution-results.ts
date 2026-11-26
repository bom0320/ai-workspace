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
import type { Handoff } from "../assignment-plans/prepare-assignment-context.js";

// Terminal failure history uses the historical approval and reservation. It must
// still be writable when a current policy or Snapshot check caused the failure.
export function recordAssignmentFailure(
  handoff: Handoff,
  planId: string,
  id: string,
  failure: AssignmentExecutionFailureStage,
  reason?: string
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
      ...(reason && { reason }),
      digest: governanceDigest({
        id,
        binding: record.binding,
        stage,
        ...(reason && { reason }),
      }),
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
          status: "task-prepared";
          resultDigest: string;
          taskContractBinding: string;
        }
      | {
          status: "failed";
          failure: AssignmentExecutionFailureStage;
          failureRecorded: true;
          reason?: string;
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
            ...(record.failure.reason && { reason: record.failure.reason }),
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
          ...("status" in record.result
            ? {
                status: "task-prepared" as const,
                taskContractBinding: record.result.taskContractBinding,
              }
            : { status: "read-completed" as const }),
          assignmentId: assignment.id,
          workItemId: assignment.workItemId,
          invocationId: record.id,
          resultDigest: record.result.digest,
        },
      ];
    });
  });
}
