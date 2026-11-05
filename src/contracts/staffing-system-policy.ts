import { z } from "zod";
import { specialistDefinitionSchema } from "./specialist.js";
import { contextAccessPolicySchema } from "./context-access-policy.js";

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

// The single structural source for Repository Staffing operating conditions.
// Only Governance can establish its Human-approved, versioned provenance.
export const staffingSystemPolicySchema = z
  .object({
    repositoryRoot: z.string().min(1),
    phase: z.literal("phase-a"),
    availableSpecialists: z
      .array(specialistDefinitionSchema)
      .min(1)
      .refine(
        (items) => new Set(items.map(({ id }) => id)).size === items.length,
        "System Policy requires unique Specialist registrations."
      )
      .refine(
        (items) =>
          items.every(
            ({ authority }) =>
              authority.repositoryAccess === "read" && !authority.shellExecution
          ),
        "System Policy requires read-only, shell-disabled Specialists."
      ),
    allowedContextPaths: z.array(z.string().min(1)).default([]),
    contextAccessPolicy: contextAccessPolicySchema.optional(),
    limits: staffingInspectionLimitsSchema,
    maxAgentInvocations: z.number().int().positive(),
  })
  .strict();
export type StaffingSystemPolicy = z.infer<typeof staffingSystemPolicySchema>;
