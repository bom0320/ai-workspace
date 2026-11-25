import {
  assignmentDelegationBinding,
  assignmentExecutionRecordSchema,
} from "./assignment-execution.js";
import { assignmentPlanSchema } from "./assignment-plan.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import {
  selectAssignmentWorkItems,
  validateAssignmentProposal,
} from "@/contracts/phase-b-assignment.js";
import { approvedDecisionSchema } from "../approval/features/direction-review/model/result.js";
import {
  directionAnalysisSchema,
  directionReviewSchema,
} from "../approval/features/direction-review/model/review.js";
import { invocationReservationSchema } from "../authorization/features/specialist-invocation/model/reservation.js";
import { analysisRefinementSchema } from "./analysis-refinement.js";
import { hasValidAnalysisRefinements } from "../records/analysis/refinement-records.js";
import { z } from "zod";
import { staffingProposalSchema } from "@/application/staffing/index.js";
import { approvedOperatingScopeSchema } from "./authority.js";
import { recordedSystemPolicySchema } from "../approval/features/system-policy/model/policy.js";
import { recordedHumanDelegationPolicySchema } from "../approval/features/human-delegation/model/policy.js";
import { approvalRecordSchema } from "../approval/features/proposal-management/model/approval.js";
import { humanConfirmationEvidenceSchema as confirmation } from "../approval/shared/model/confirmation.js";
import { executionDelegationSchema } from "../approval/features/execution-delegation/model/execution-delegation.js";
import { hasValidExecutionDelegationRecords } from "../approval/features/execution-delegation/validation/validate-execution-delegation-records.js";
import {
  executionScopes,
  isExecutionScopeContained,
  recordedExecutionPolicySchema,
} from "../approval/features/system-policy/model/execution-system-policy.js";
import { hasValidExecutionPolicyRecords } from "../approval/features/system-policy/flow/validation/execution-policy-configuration.js";
import {
  executionDecompositionSchema,
  workItemExecutionSourceSchema,
  executionReservationSchema,
} from "../authorization/features/work-item-execution/model/execution.js";
import { hasValidExecutionReservations } from "../authorization/features/work-item-execution/flow/validation/validate-execution-reservations.js";
const text = z.string().min(1);

export const governanceLedgerSchema = z
  .object({
    repositories: z.record(
      text,
      z
        .object({
          systems: z.array(
            z
              .object({
                version: z.number().int().positive(),
                configuration: recordedSystemPolicySchema,
                approval: confirmation,
              })
              .strict()
          ),
          delegations: z.array(recordedHumanDelegationPolicySchema),
          // Absent in historical ledgers. Reads never add defaults or rewrite history.
          // Legacy read compatibility only; new Reviews carry their own Context.
          directionAnalyses: z.array(directionAnalysisSchema).optional(),
          directionReviews: z.array(directionReviewSchema).optional(),
          approvedDecisions: z.array(approvedDecisionSchema).optional(),
          executionPolicies: z.array(recordedExecutionPolicySchema).optional(),
          executionDelegations: z.array(executionDelegationSchema).optional(),
          executionDecompositions: z
            .array(executionDecompositionSchema)
            .optional(),
          assignmentPlans: z.array(assignmentPlanSchema).optional(),
          workItemExecutionSources: z
            .array(workItemExecutionSourceSchema)
            .optional(),
          assignmentExecutions: z
            .array(assignmentExecutionRecordSchema)
            .optional(),
          executionReservations: z.array(executionReservationSchema).optional(),
          reservations: z.array(invocationReservationSchema).optional(),
          analysisRefinements: z.array(analysisRefinementSchema).optional(),
          issuances: z.array(
            z
              .object({
                proposal: staffingProposalSchema,
                approval: approvalRecordSchema,
                scope: approvedOperatingScopeSchema,
              })
              .strict()
          ),
        })
        .strict()
    ),
  })
  .strict()
  .superRefine((ledger, context) => {
    const ids = new Set<string>();
    const executionIds = new Set<string>();
    const delegationIds = new Set<string>();
    const executionApprovalIds = new Set<string>();
    const staffingConfirmationIds = new Set<string>();
    const directionConfirmationCounts = new Map<string, number>();
    for (const entry of Object.values(ledger.repositories)) {
      for (const { approval } of [...entry.systems, ...entry.delegations])
        staffingConfirmationIds.add(approval.id);
      for (const { approval } of entry.issuances)
        if (approval.source.type === "direct-human")
          staffingConfirmationIds.add(approval.source.confirmation.id);
      for (const { resolution } of entry.directionReviews ?? []) {
        if (!resolution) continue;
        const id = resolution.confirmation.id;
        directionConfirmationCounts.set(
          id,
          (directionConfirmationCounts.get(id) ?? 0) + 1
        );
      }
    }
    for (const [key, entry] of Object.entries(ledger.repositories)) {
      if (!hasValidAnalysisRefinements(entry))
        context.addIssue({
          code: "custom",
          message: "Invalid Analysis Refinement or cumulative budget.",
        });
      const planIds = new Set<string>();
      for (const { id, ...plan } of entry.assignmentPlans ?? []) {
        const decomposition = entry.executionDecompositions?.find(
          ({ binding }) => binding === plan.decompositionBinding
        );
        const selected =
          decomposition &&
          selectAssignmentWorkItems(
            decomposition.workItems,
            plan.selectedWorkItemIds
          );
        if (
          planIds.has(id) ||
          governanceDigest(plan) !== id ||
          governanceDigest(plan.snapshot.repositoryRoot) !== key ||
          !selected ||
          validateAssignmentProposal(plan.assignments, selected)
        )
          context.addIssue({
            code: "custom",
            message: "Invalid Assignment Plan binding.",
          });
        planIds.add(id);
      }
      const assignmentKeys = new Set<string>();
      const workItemPlans = new Map<string, string>();
      const executionCounts = new Map<string, number>();
      for (const reservation of entry.executionReservations ?? [])
        executionCounts.set(
          reservation.delegationId,
          (executionCounts.get(reservation.delegationId) ?? 0) + 1
        );
      for (const record of entry.assignmentExecutions ?? []) {
        const plan = entry.assignmentPlans?.find(
          ({ id }) => id === record.request.planId
        );
        const decomposition = entry.executionDecompositions?.find(
          ({ binding }) => binding === plan?.decompositionBinding
        );
        const assignment = plan?.assignments.find(
          ({ id }) => id === record.request.assignmentId
        );
        const delegation = entry.executionDelegations?.find(
          ({ id }) => id === record.delegationId
        );
        const policyRecord = entry.executionPolicies?.find(
          ({ version }) => version === delegation?.grant.policyVersion
        );
        const policy = policyRecord?.policy;
        const { execution, request } = record;
        const count = (executionCounts.get(record.delegationId) ?? 0) + 1;
        const key = JSON.stringify([
          request.planId,
          request.assignmentId,
          request.access,
        ]);
        const workKey = JSON.stringify([
          record.delegationId,
          assignment?.workItemId,
        ]);
        const competing = workItemPlans.get(workKey);
        const scope = { readScopes: request.readScopes, writeScopes: [] };
        if (
          executionIds.has(record.id) ||
          assignmentKeys.has(key) ||
          (competing !== undefined && competing !== request.planId) ||
          entry.executionReservations?.some(
            ({ sourceId, delegationId }) =>
              delegationId === record.delegationId &&
              entry.workItemExecutionSources?.some(
                (source) =>
                  source.id === sourceId &&
                  source.workItemId === assignment?.workItemId
              )
          ) ||
          !delegation ||
          !policy ||
          !decomposition ||
          !plan ||
          !assignment ||
          delegation.approvedDecisionId !== decomposition.approvedDecisionId ||
          execution.specialistId !== assignment.specialistId ||
          execution.id !== record.id ||
          execution.planId !== request.planId ||
          execution.assignmentId !== request.assignmentId ||
          execution.timeoutMs !== request.timeoutMs ||
          execution.delegationId !== record.delegationId ||
          execution.delegationBinding !==
            assignmentDelegationBinding(delegation) ||
          execution.policyBinding !== policyRecord.binding ||
          execution.expiresAt !== delegation.grant.expiresAt ||
          governanceDigest(execution.snapshot) !==
            governanceDigest(plan.snapshot) ||
          governanceDigest(execution.readScopes) !==
            governanceDigest(request.readScopes) ||
          record.binding !== governanceDigest({ request, execution }) ||
          !isExecutionScopeContained(scope, executionScopes(policy)) ||
          !isExecutionScopeContained(
            scope,
            executionScopes(delegation.grant)
          ) ||
          request.timeoutMs >
            Math.min(
              policy.budget.maxTimeoutMs,
              delegation.grant.budget.maxTimeoutMs
            ) ||
          count >
            Math.min(
              policy.budget.maxExecutions,
              delegation.grant.budget.maxExecutions
            ) ||
          record.reservedAt < delegation.issuedAt ||
          Date.parse(record.reservedAt) + request.timeoutMs >
            Date.parse(execution.expiresAt) ||
          (record.claimedAt &&
            (record.claimedAt < record.reservedAt ||
              Date.parse(record.claimedAt) + request.timeoutMs >
                Date.parse(execution.expiresAt))) ||
          (record.failure &&
            (record.result ||
              record.failure.digest !==
                governanceDigest({
                  id: record.id,
                  binding: record.binding,
                  stage: record.failure.stage,
                }))) ||
          (record.result &&
            (!record.claimedAt ||
              record.result.decision.specialistId !== assignment.specialistId ||
              record.result.digest !==
                governanceDigest({
                  id: record.id,
                  binding: record.binding,
                  decision: record.result.decision,
                  ...(record.result.contextDigest && {
                    contextDigest: record.result.contextDigest,
                  }),
                })))
        )
          context.addIssue({
            code: "custom",
            message: "Invalid Assignment execution record.",
          });
        executionIds.add(record.id);
        assignmentKeys.add(key);
        workItemPlans.set(workKey, request.planId);
        executionCounts.set(record.delegationId, count);
      }
      if (!hasValidExecutionReservations(entry, key, executionIds))
        context.addIssue({
          code: "custom",
          message: "Invalid execution provenance or reservation.",
        });
      if (
        !hasValidExecutionPolicyRecords(
          key,
          entry,
          executionApprovalIds,
          staffingConfirmationIds,
          directionConfirmationCounts
        ) ||
        !hasValidExecutionDelegationRecords(
          key,
          entry,
          delegationIds,
          executionApprovalIds,
          staffingConfirmationIds,
          directionConfirmationCounts
        )
      )
        context.addIssue({
          code: "custom",
          message:
            "Invalid Execution Delegation or Execution System Policy record.",
        });
      const counts = new Map<string, number>();
      for (const reservation of entry.reservations ?? []) {
        const issuance = entry.issuances.find(
          ({ scope }) =>
            scope.id === reservation.scopeId &&
            scope.version === reservation.scopeVersion
        );
        if (
          ids.has(reservation.invocationId) ||
          !issuance ||
          !issuance.scope.assignments.some(
            ({ assignmentId }) => assignmentId === reservation.assignmentId
          ) ||
          Date.parse(reservation.reservedAt) <
            Date.parse(issuance.approval.approvedAt)
        ) {
          context.addIssue({
            code: "custom",
            message: "Invalid Invocation reservation binding or duplicate ID.",
          });
          continue;
        }
        ids.add(reservation.invocationId);
        const key = `${reservation.scopeId}:${reservation.scopeVersion}`;
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        if (count > issuance.scope.budget.maxAgentInvocations)
          context.addIssue({
            code: "custom",
            message: "Stored Invocation reservations exceed Scope budget.",
          });
      }
    }
  });
export type GovernanceLedger = z.infer<typeof governanceLedgerSchema>;
export type RepositoryGovernance = GovernanceLedger["repositories"][string];
