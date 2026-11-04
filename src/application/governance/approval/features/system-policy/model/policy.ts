import { contextAccessPolicySchema } from "@/contracts/context-access-policy.js";
import { z } from "zod";
import { specialistDefinitionSchema } from "@/contracts/specialist.js";
import {
  staffingInspectionLimitsSchema,
  staffingProposalPolicySchema,
} from "@/application/staffing/index.js";
const text = z.string().min(1);

export const staffingSystemPolicySchema = z
  .object({
    repositoryRoot: text,
    phase: z.literal("phase-a"),
    availableSpecialists: z.array(specialistDefinitionSchema).min(1),
    allowedContextPaths: z.array(text).default([]),
    contextAccessPolicy: contextAccessPolicySchema.optional(),
    limits: staffingInspectionLimitsSchema,
    policy: staffingProposalPolicySchema,
  })
  .strict();
export type StaffingSystemPolicy = z.infer<typeof staffingSystemPolicySchema>;
