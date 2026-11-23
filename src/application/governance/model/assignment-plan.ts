import { z } from "zod";
import { phaseBAssignmentsSchema } from "@/contracts/phase-b-assignment.js";
import { repositorySnapshotSchema } from "@/contracts/repository/snapshot.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const assignmentPlanSchema = z
  .object({
    id: digest,
    decompositionBinding: digest,
    staffingBinding: digest,
    snapshot: repositorySnapshotSchema,
    assignments: phaseBAssignmentsSchema,
  })
  .strict();

export type AssignmentPlan = z.infer<typeof assignmentPlanSchema>;
