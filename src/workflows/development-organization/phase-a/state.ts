import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { staffingSystemPolicySchema } from "@/contracts/staffing/system-policy.js";
import type { StaffingSystemPolicyResult } from "@/application/governance/index.js";
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

// Shared inputs reuse their original schemas. A lookup result is runtime data,
// not a substitute for the Governance Ledger's approval and authority records.
export const phaseAState = new StateSchema({
  ...developmentOrganizationState.fields,
  policyLookup: policyLookupSchema.optional(),
});

export type PhaseAState = typeof phaseAState.State;
