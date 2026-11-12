import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { goalSpecSchema } from "@/contracts/goal.js";
import { staffingSystemPolicySchema } from "@/contracts/staffing/system-policy.js";

// Runtime data only: policy data in State is not a Governance approval record.
export const developmentOrganizationState = new StateSchema({
  goal: goalSpecSchema,
  repositoryPath: z.string().min(1),
  systemPolicy: staffingSystemPolicySchema.optional(),
  policyVersion: z.number().int().positive().optional(),
  status: z.enum(["policy-ready", "policy-unavailable"]).optional(),
  failure: z.string().min(1).optional(),
});

export type DevelopmentOrganizationState =
  typeof developmentOrganizationState.State;
