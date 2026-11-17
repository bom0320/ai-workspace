import {
  directionReviewSchema,
  directionActionSchema,
  directionGovernanceResultSchema,
} from "@/application/governance/index.js";
import {
  synthesisContextSchema,
  synthesisResultSchema,
} from "@/application/synthesis/index.js";
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
      decisions: z.array(agentDecisionSchema).min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      stage: z.enum(["preflight", "authorization", "claim", "decision"]),
      reason: z.string(),
      assignmentId: z.string().optional(),
    })
    .strict(),
]);

export type SpecialistDecisionsWorkflowResult = z.infer<
  typeof specialistDecisionsResultSchema
>;

const decisionComparisonResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("completed"),
      comparison: comparisonPayloadSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("skipped"),
      reason: z.literal("insufficient-decisions"),
    })
    .strict(),
  z.object({ status: z.literal("failed"), reason: z.string() }).strict(),
]);

export type DecisionComparisonStageResult = z.infer<
  typeof decisionComparisonResultSchema
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

// Stage results are execution data, not Ledger authority or a final Phase A Outcome.
export const phaseAState = new StateSchema({
  ...developmentOrganizationState.fields,
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
  decisionComparisonResult: decisionComparisonResultSchema.optional(),
  synthesisAssignments: synthesisContextSchema.shape.assignments.optional(),
  synthesisResult: synthesisResultSchema.optional(),
  directionReview: directionReviewSchema.optional(),
  directionAction: directionActionSchema.optional(),
  directionGovernanceResult: directionGovernanceResultSchema.optional(),
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
