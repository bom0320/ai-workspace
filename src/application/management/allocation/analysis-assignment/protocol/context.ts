import { z } from "zod";

import { specialistDefinitionSchema } from "@/contracts/specialist/definition.js";
import { goalSpecSchema } from "@/contracts/goal.js";
import { inspectedFileSchema } from "@/contracts/repository/inspected-file.js";
import { pathScopeSchema } from "@/contracts/repository/context-access-policy.js";

import { staffingInspectionLimitsSchema } from "@/contracts/governance/staffing-system-policy.js";
const nonnegativeInteger = z.number().int().nonnegative();
export const staffingAssignmentConstraintsSchema = z
  .object({
    allowedSpecialistIds: z.array(z.string().min(1)).min(1),
    delegatedContextScopes: z.array(pathScopeSchema),
    maxAgentInvocations: z.number().int().positive(),
    maxTotalAnalysisInvocations: z.number().int().positive().optional(),
  })
  .strict();
export type StaffingAssignmentConstraints = z.infer<
  typeof staffingAssignmentConstraintsSchema
>;

// Candidates are a projection of Harness registration, not CEO-defined authority.
export const specialistCandidateSchema = specialistDefinitionSchema.pick({
  id: true,
  role: true,
  objective: true,
});

// Repository instructions and file contents are untrusted data, never Harness policy.
export const staffingContextSchema = z
  .object({
    goal: goalSpecSchema.strict(),
    repository: z
      .object({
        name: z.string().min(1),
        commitSha: z.string().min(1),
        fileTree: z.array(z.string().min(1)),
        packageScripts: z.record(z.string(), z.string()),
        instructions: z.string().optional(),
      })
      .strict(),
    inspectedFiles: z.array(inspectedFileSchema.strict()),
    availableSpecialists: z.array(specialistCandidateSchema),
    assignmentConstraints: staffingAssignmentConstraintsSchema.optional(),
    maxTotalAnalysisInvocations: z.number().int().positive().optional(),
    limits: staffingInspectionLimitsSchema,
    remainingInspectionBudget: nonnegativeInteger,
  })
  .strict();

export type SpecialistCandidate = z.infer<typeof specialistCandidateSchema>;
export type StaffingContext = z.infer<typeof staffingContextSchema>;
