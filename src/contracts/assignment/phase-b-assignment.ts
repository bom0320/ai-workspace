import { z } from "zod";

const text = z.string().trim().min(1);

export const phaseBAssignmentSchema = z
  .object({
    id: text,
    workItemId: text,
    specialistId: text,
    repositoryAccessCeiling: z.enum(["read", "write"]),
    objective: text,
    deliverable: text,
    dependsOn: z.array(text).refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();

export const phaseBAssignmentsSchema = z.array(phaseBAssignmentSchema).min(1);
export type PhaseBAssignment = z.infer<typeof phaseBAssignmentSchema>;
