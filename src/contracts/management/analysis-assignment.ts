import { z } from "zod";

const nonEmptyString = z.string().min(1);

export const analysisAssignmentSchema = z
  .object({
    assignmentId: nonEmptyString,
    // References an existing SpecialistDefinition; registration is validated later.
    specialistId: nonEmptyString,
    // Goal-specific delegation, not the SpecialistDefinition's default objective.
    objective: nonEmptyString,
    contextPaths: z.array(nonEmptyString).min(1),
    rationale: nonEmptyString,
  })
  .strict();

export type AnalysisAssignment = z.infer<typeof analysisAssignmentSchema>;
