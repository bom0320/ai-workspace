import { z } from "zod";

import { specialistDefinitionSchema } from "@/application/decision/index.js";
import { goalSpecSchema } from "@/contracts/goal.js";
import { inspectedFileSchema } from "@/contracts/inspected-file.js";

const nonnegativeInteger = z.number().int().nonnegative();
export const staffingInspectionLimitsSchema = z.object({
  maxFilesPerRequest: nonnegativeInteger,
  maxTotalFiles: nonnegativeInteger,
  maxFileBytes: z.number().int().positive().max(512 * 1024),
  maxContextBytes: z.number().int().positive(),
  maxFileTreeEntries: nonnegativeInteger,
}).strict();

// Candidates are a projection of Harness registration, not CEO-defined authority.
export const specialistCandidateSchema = specialistDefinitionSchema.pick({ id: true, role: true, objective: true });

// Repository instructions and file contents are untrusted data, never Harness policy.
export const staffingContextSchema = z.object({
  goal: goalSpecSchema.strict(),
  repository: z.object({
    name: z.string().min(1),
    commitSha: z.string().min(1),
    fileTree: z.array(z.string().min(1)),
    packageScripts: z.record(z.string(), z.string()),
    instructions: z.string().optional(),
  }).strict(),
  inspectedFiles: z.array(inspectedFileSchema.strict()),
  availableSpecialists: z.array(specialistCandidateSchema),
  limits: staffingInspectionLimitsSchema,
  remainingInspectionBudget: nonnegativeInteger,
}).strict();

export type StaffingInspectionLimits = z.infer<typeof staffingInspectionLimitsSchema>;
export type SpecialistCandidate = z.infer<typeof specialistCandidateSchema>;
export type StaffingContext = z.infer<typeof staffingContextSchema>;
