import { z } from "zod";
import { executionAssignmentsSchema } from "@/contracts/management/execution-assignment.js";
import { repositorySnapshotSchema } from "@/contracts/repository/snapshot.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const assignmentPlanSchema = z
  .object({
    id: digest,
    writeDetailingVersion: z.literal(1).optional(),
    decompositionBinding: digest,
    staffingBinding: digest,
    snapshot: repositorySnapshotSchema,
    selectedWorkItemIds: z.array(z.string().min(1)).min(1),
    assignments: executionAssignmentsSchema,
  })
  .strict();

export type AssignmentPlan = z.infer<typeof assignmentPlanSchema>;
