import { z } from "zod";

import {
  staffingAssignmentSchema,
  staffingProposalSchema,
} from "../model/staffing.js";

// CEO messages share the proposal fields but cannot supply Harness-owned data.
export const staffingAssignmentDraftSchema = staffingAssignmentSchema.omit({
  assignmentId: true,
});

export const staffingDraftSchema = staffingProposalSchema
  .omit({
    id: true,
    goal: true,
    snapshot: true,
  })
  .extend({
    assignments: z.array(staffingAssignmentDraftSchema).min(1),
  })
  .strict();

// Inspection is a request, not permission to access Repository files.
export const ceoStaffingDecisionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("propose"), draft: staffingDraftSchema }).strict(),
  z
    .object({
      type: z.literal("inspect"),
      paths: z.array(z.string().min(1)).min(1),
      reason: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("escalate"),
      reason: z.string().min(1),
      questions: z.array(z.string().min(1)).min(1),
    })
    .strict(),
]);

export type StaffingAssignmentDraft = z.infer<
  typeof staffingAssignmentDraftSchema
>;
export type StaffingDraft = z.infer<typeof staffingDraftSchema>;
export type CEOStaffingDecision = z.infer<typeof ceoStaffingDecisionSchema>;
