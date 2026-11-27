import { fingerprintExecutionArtifacts } from "@/services/artifacts/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { resolveAssignmentExecution } from "../../authorization/features/assignment-execution/flow/context/resolve-assignment-execution.js";
import {
  bindAssignmentReadExecution,
  bindAssignmentWriteExecution,
} from "../../authorization/features/assignment-execution/flow/binding/bind-assignment-execution.js";
import { resolveApprovedDecision } from "../../approval/features/direction-review/flow/approved-decision.js";
import {
  AssignmentExecutionError,
  isAssignmentReadRecord,
  assignmentExecutionFailureStageSchema,
  type AssignmentExecutionFailureStage,
} from "../../model/assignment-execution.js";
import type { GovernanceLedger } from "../../model/ledger.js";
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
  planId: string,
  {
    includeIntegrationScope = false,
  }: { includeIntegrationScope?: boolean } = {}
) {
  return withGovernanceLedger((ledger) =>
    resolveAssignmentExecutionResults(
      ledger,
      handoff,
      planId,
      includeIntegrationScope
    )
  );
}

export function resolveAssignmentExecutionResults(
  ledger: GovernanceLedger,
  handoff: Handoff,
  planId: string,
  includeIntegrationScope: boolean
) {
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
    | { status: "denied"; failure: "duplicate" }
    | {
        status: "write-completed";
        resultDigest: string;
        specialistId: string;
        taskContractBinding: string;
        artifacts: ReturnType<typeof fingerprintExecutionArtifacts>;
        integrationScope?: {
          allowedPaths: string[];
          forbiddenPaths: string[];
          verification: string[];
          deadlineMs: number;
        };
      }
    | {
        status: "task-prepared";
        planFormat: "structured" | "legacy-steps";
        resultDigest: string;
        taskContractBinding: string;
      }
    | {
        status: "failed";
        failure: AssignmentExecutionFailureStage;
        failureRecorded: boolean;
        reason?: string;
        resultDigest?: string;
        artifacts?: ReturnType<typeof fingerprintExecutionArtifacts>;
      }
  );
  const records = (entry.assignmentExecutions ?? []).filter(
    (record) =>
      record.request.planId === planId && record.delegationId === delegation.id
  );
  const writeAttempts = new Set(
    records
      .filter((record) => !isAssignmentReadRecord(record))
      .map(({ request }) => request.assignmentId)
  );
  return records.flatMap<Reference>((record) => {
    if (
      isAssignmentReadRecord(record) &&
      writeAttempts.has(record.request.assignmentId)
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
    if (!isAssignmentReadRecord(record)) {
      const context = resolveAssignmentExecution(
        ledger,
        handoff,
        record.request
      );
      const { binding, task } = bindAssignmentWriteExecution(
        context,
        record.request,
        record.id
      );
      if (binding !== record.binding)
        throw new AssignmentExecutionError("handoff");
      const identity = {
        assignmentId: context.assignment.id,
        workItemId: context.workItem.id,
        invocationId: record.id,
      };
      if (!record.result)
        return [{ ...identity, status: "denied", failure: "duplicate" }];
      const { artifacts, digest: resultDigest, passed } = record.result;
      if (artifacts) {
        try {
          if (
            governanceDigest(
              fingerprintExecutionArtifacts(
                artifacts.directory,
                undefined,
                !!artifacts.patchDigest
              )
            ) !== governanceDigest(artifacts)
          )
            throw new Error("Execution artifact digest mismatch.");
        } catch {
          return [
            {
              ...identity,
              status: "failed",
              failure: "handoff",
              failureRecorded: false,
            },
          ];
        }
      }
      if (!passed || !artifacts)
        return [
          {
            ...identity,
            status: "failed",
            failure: "execution",
            failureRecorded: true,
            resultDigest,
            ...(artifacts && { artifacts }),
          },
        ];
      return [
        {
          ...identity,
          status: "write-completed",
          resultDigest,
          artifacts,
          ...(includeIntegrationScope && {
            integrationScope: {
              allowedPaths: task.allowedPaths,
              forbiddenPaths: task.forbiddenPaths,
              verification: task.verification,
              deadlineMs: Math.min(
                Date.parse(delegation.grant.expiresAt),
                Date.now() +
                  Math.min(
                    context.policy.budget.maxTimeoutMs,
                    delegation.grant.budget.maxTimeoutMs
                  )
              ),
            },
          }),
          specialistId: context.specialist.id,
          taskContractBinding: record.request.taskContractBinding,
        },
      ];
    }
    const context = resolveAssignmentExecution(ledger, handoff, record.request);
    const { assignment } = context;
    const { binding } = bindAssignmentReadExecution(
      context,
      record.request,
      record.id
    );
    if (binding !== record.binding)
      throw new AssignmentExecutionError("handoff");
    const identity = {
      assignmentId: assignment.id,
      workItemId: assignment.workItemId,
      invocationId: record.id,
    };
    // A Read Reservation already consumes budget and cannot be retried as new.
    if (!record.result)
      return [{ ...identity, status: "denied", failure: "duplicate" }];
    return [
      {
        ...("status" in record.result
          ? {
              status: "task-prepared" as const,
              planFormat: record.result.task.implementationPlan
                ? ("structured" as const)
                : ("legacy-steps" as const),
              taskContractBinding: record.result.taskContractBinding,
            }
          : { status: "read-completed" as const }),
        ...identity,
        resultDigest: record.result.digest,
      },
    ];
  });
}
