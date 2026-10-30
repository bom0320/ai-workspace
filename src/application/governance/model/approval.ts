import { z } from "zod";

import { specialistAuthoritySchema } from "@/contracts/specialist-authority.js";
import { specialistDefinitionSchema } from "@/contracts/specialist.js";
import {
  staffingInspectionLimitsSchema,
  staffingProposalPolicySchema,
  staffingProposalSchema,
  type StaffingProposal,
} from "@/application/staffing/index.js";
import { approvedOperatingScopeSchema } from "./authority.js";

const text = z.string().min(1);
const date = z.iso.datetime();
export const staffingSystemPolicySchema = z
  .object({
    repositoryRoot: text,
    phase: z.literal("phase-a"),
    availableSpecialists: z.array(specialistDefinitionSchema).min(1),
    allowedContextPaths: z.array(text),
    limits: staffingInspectionLimitsSchema,
    policy: staffingProposalPolicySchema,
  })
  .strict();
export type StaffingSystemPolicy = z.infer<typeof staffingSystemPolicySchema>;

export const humanDelegationPolicyInputSchema = specialistAuthoritySchema
  .extend({
    phase: z.literal("phase-a"),
    allowedSpecialistIds: z.array(text).min(1),
    allowedContextPaths: z.array(text),
    repositoryAccess: z.literal("read"),
    shellExecution: z.literal(false),
    maxAgentInvocations: z.number().int().positive(),
    expiresAt: date,
  })
  .strict();
export type HumanDelegationPolicyInput = z.infer<
  typeof humanDelegationPolicyInputSchema
>;

const confirmation = z
  .object({ id: text, uid: z.number().int().nonnegative(), confirmedAt: date })
  .strict();
export const humanDelegationPolicySchema = humanDelegationPolicyInputSchema
  .extend({
    id: text,
    version: z.number().int().positive(),
    repositoryRoot: text,
    systemPolicyVersion: z.number().int().positive(),
    status: z.enum(["active", "revoked", "superseded"]),
    approval: confirmation,
  })
  .strict();
export type HumanDelegationPolicy = z.infer<typeof humanDelegationPolicySchema>;

export const approvalRecordSchema = z
  .object({
    id: text,
    proposalId: text,
    proposalDigest: text,
    approvedAt: date,
    systemPolicyVersion: z.number().int().positive(),
    source: z.discriminatedUnion("type", [
      z.object({ type: z.literal("direct-human"), confirmation }).strict(),
      z
        .object({
          type: z.literal("human-delegation"),
          delegationPolicyId: text,
          delegationPolicyVersion: z.number().int().positive(),
          delegationApprovalId: text,
        })
        .strict(),
    ]),
  })
  .strict();
export type ApprovalRecord = z.infer<typeof approvalRecordSchema>;

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
                configuration: staffingSystemPolicySchema,
                approval: confirmation,
              })
              .strict()
          ),
          delegations: z.array(humanDelegationPolicySchema),
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
  .strict();
export type GovernanceLedger = z.infer<typeof governanceLedgerSchema>;
export type RepositoryGovernance = GovernanceLedger["repositories"][string];

export type StaffingApprovalResult =
  | {
      status: "approved";
      approval: ApprovalRecord;
      scope: z.infer<typeof approvedOperatingScopeSchema>;
    }
  | { status: "configured"; version: number }
  | {
      status: "approval-required";
      kind: "system-policy" | "delegation" | "staffing";
      binding: string;
      reason: string;
      subject:
        | StaffingSystemPolicy
        | HumanDelegationPolicyInput
        | StaffingProposal
        | null;
    }
  | { status: "denied"; reason: string };
