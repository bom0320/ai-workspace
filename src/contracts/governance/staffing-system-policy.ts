import { z } from "zod";
import {
  hasUniqueSpecialistIds,
  specialistDefinitionSchema,
} from "../specialist/definition.js";
import { specialistAuthoritySchema } from "../specialist/authority.js";
import { contextAccessPolicySchema } from "../repository/context-access-policy.js";

const nonnegativeInteger = z.number().int().nonnegative();
export const staffingInspectionLimitsSchema = z
  .object({
    maxFilesPerRequest: nonnegativeInteger,
    maxTotalFiles: nonnegativeInteger,
    maxFileBytes: z
      .number()
      .int()
      .positive()
      .max(512 * 1024),
    maxContextBytes: z.number().int().positive(),
    maxFileTreeEntries: nonnegativeInteger,
  })
  .strict();

export type StaffingInspectionLimits = z.infer<
  typeof staffingInspectionLimitsSchema
>;

// Preserve the flat policy entry and its existing signed representation.
export const staffingSpecialistSchema = specialistDefinitionSchema.extend({
  authority: specialistAuthoritySchema,
});

// The single structural source for Repository Staffing operating conditions.
// Only Governance can establish its Human-approved, versioned provenance.
export const staffingSystemPolicySchema = z
  .object({
    repositoryRoot: z.string().min(1),
    phase: z.literal("phase-a"),
    availableSpecialists: z
      .array(staffingSpecialistSchema)
      .min(1)
      .refine(hasUniqueSpecialistIds, "Duplicate Specialist IDs.")
      .refine(
        (items) =>
          items.every(
            ({ authority }) =>
              authority.repositoryAccess === "read" && !authority.shellExecution
          ),
        "System Policy requires read-only, shell-disabled Specialists."
      ),
    contextAccessPolicy: contextAccessPolicySchema,
    limits: staffingInspectionLimitsSchema,
    maxAgentInvocations: z.number().int().positive(),
    analysis: z
      .object({
        maxTotalAnalysisInvocations: z.number().int().positive(),
        maxRefinementRounds: nonnegativeInteger,
      })
      .strict()
      .optional(),
  })
  .strict();
export type StaffingSystemPolicy = z.infer<typeof staffingSystemPolicySchema>;
