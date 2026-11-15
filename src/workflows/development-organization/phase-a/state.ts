import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { staffingSystemPolicySchema } from "@/contracts/staffing/system-policy.js";
import {
  approvalRecordSchema,
  approvedOperatingScopeSchema,
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
export const phaseAState = new StateSchema({
  ...developmentOrganizationState.fields,
  policyLookup: policyLookupSchema.optional(),
  staffingResult: staffingRunResultSchema.optional(),
  approvalResult: staffingApprovalEvaluationSchema.optional(),
});

export type PhaseAState = typeof phaseAState.State;
