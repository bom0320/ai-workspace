import { z } from "zod";

const text = z.string().trim().min(1);

export const executionAssignmentSchema = z
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

export const executionAssignmentsSchema = z
  .array(executionAssignmentSchema)
  .min(1);
export type ExecutionAssignment = z.infer<typeof executionAssignmentSchema>;
