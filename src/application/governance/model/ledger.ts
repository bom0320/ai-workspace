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
import { recordedExecutionPolicySchema } from "../approval/features/system-policy/model/execution-system-policy.js";
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
          workItemExecutionSources: z
            .array(workItemExecutionSourceSchema)
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
