import { invocationReservationSchema } from "../authorization/features/specialist-invocation/model/reservation.js";
import { z } from "zod";
import { staffingProposalSchema } from "@/application/staffing/index.js";
import { approvedOperatingScopeSchema } from "./authority.js";
import { recordedSystemPolicySchema } from "../approval/features/system-policy/model/policy.js";
import { recordedHumanDelegationPolicySchema } from "../approval/features/human-delegation/model/policy.js";
import { approvalRecordSchema } from "../approval/features/proposal-management/model/approval.js";
import { humanConfirmationEvidenceSchema as confirmation } from "../approval/shared/model/confirmation.js";
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
          reservations: z.array(invocationReservationSchema).optional(),
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
    for (const entry of Object.values(ledger.repositories)) {
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
