import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { staffingSystemPolicySchema } from "@/contracts/staffing/system-policy.js";
import {
  approvalRecordSchema,
  approvedOperatingScopeSchema,
  invokeSpecialistRequestSchema,
} from "@/application/governance/index.js";
import {
  staffingRunResultSchema,
  staffingProposalSchema,
} from "@/application/staffing/index.js";
import type {
  StaffingApprovalResult,
  StaffingSystemPolicyResult,
} from "@/application/governance/index.js";
import { developmentOrganizationState } from "../state.js";

import { agentDecisionSchema } from "@/application/decision/index.js";
import { comparisonPayloadSchema } from "@/application/comparison/index.js";

// The envelope belongs to this Graph; Domain payload validation stays in v2/v3.
const specialistDecisionsResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("completed"),
      decisions: z.array(agentDecisionSchema),
      comparison: comparisonPayloadSchema.optional(),
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      stage: z.enum([
        "preflight",
        "authorization",
        "claim",
        "decision",
        "comparison",
      ]),
      reason: z.string(),
      assignmentId: z.string().optional(),
    })
    .strict(),
]);

export type SpecialistDecisionsWorkflowResult = z.infer<
  typeof specialistDecisionsResultSchema
>;

const policyLookupSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("ready"),
      configuration: staffingSystemPolicySchema,
      version: z.number().int().positive(),
    })
    .strict(),
  z.object({ status: z.literal("denied"), reason: z.string().min(1) }).strict(),
]) satisfies z.ZodType<StaffingSystemPolicyResult>;

// Graph-local evaluation boundary: only Staffing Approval results are accepted.
// Reuse the Domain schemas; this does not validate approval authority or provenance.
export const staffingApprovalEvaluationSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("approved"),
      approval: approvalRecordSchema,
      scope: approvedOperatingScopeSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("approval-required"),
      kind: z.literal("staffing"),
      binding: z.string().min(1),
      reason: z.string().min(1),
      subject: staffingProposalSchema,
    })
    .strict(),
  z.object({ status: z.literal("denied"), reason: z.string().min(1) }).strict(),
]) satisfies z.ZodType<
  Exclude<StaffingApprovalResult, { status: "configured" }>
>;

// Shared inputs reuse their original schemas. A lookup result is runtime data,
// not a substitute for the Governance Ledger's approval and authority records.
export const staffingApprovalResultSchema = z.union([
  staffingRunResultSchema.options[1],
  staffingRunResultSchema.options[2],
  staffingApprovalEvaluationSchema.options[0],
  staffingApprovalEvaluationSchema.options[2],
  z
    .object({
      status: z.literal("approval-required"),
      request: staffingApprovalEvaluationSchema.options[1],
    })
    .strict(),
  z
    .object({ status: z.literal("rejected"), reason: z.string().min(1) })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      failure: z.enum(["system-policy", "confirmation"]),
      reason: z.string().min(1),
      rounds: z.number().int().nonnegative(),
    })
    .strict(),
]);

// This is the Staffing Approval stage result, not a final Phase A Outcome.
export const phaseAState = new StateSchema({
  ...developmentOrganizationState.fields,
  staffingApprovalResult: staffingApprovalResultSchema.optional(),
  specialistDecisionsResult: specialistDecisionsResultSchema.optional(),
  preparedSpecialistRequests: z.array(invokeSpecialistRequestSchema).optional(),
  currentSpecialistIndex: z.number().int().nonnegative().optional(),
  collectedDecisions: z.array(agentDecisionSchema).optional(),
  // Preflight's trusted comparison inputs are data, never execution authority.
  specialistComparisonContext: z
    .object({
      goal: developmentOrganizationState.fields.goal,
      repositoryCommitSha: z.string(),
    })
    .strict()
    .optional(),
  specialistComparison: comparisonPayloadSchema.optional(),
  policyLookup: policyLookupSchema.optional(),
  staffingResult: staffingRunResultSchema.optional(),
  approvalResult: z
    .union([
      staffingApprovalEvaluationSchema,
      z
        .object({ status: z.literal("rejected"), reason: z.string().min(1) })
        .strict(),
      z
        .object({
          status: z.literal("failed"),
          failure: z.literal("confirmation"),
          reason: z.string().min(1),
          rounds: z.number().int().nonnegative(),
        })
        .strict(),
    ])
    .optional(),
});

export type PhaseAState = typeof phaseAState.State;
export type StaffingApprovalStageResult = z.infer<
  typeof staffingApprovalResultSchema
>;
