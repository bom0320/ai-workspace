import { z } from "zod";

import { repositorySnapshotSchema } from "@/application/decision/index.js";
import { goalSpecSchema } from "@/contracts/goal.js";

const nonEmptyString = z.string().min(1);

// CEO interpretation, separate from the original Human Goal and constraints.
export const intentAnalysisSchema = z.object({
  problem: nonEmptyString,
  desiredOutcome: nonEmptyString,
  considerations: z.array(nonEmptyString),
  uncertainties: z.array(nonEmptyString),
}).strict();

export const staffingAssignmentSchema = z.object({
  assignmentId: nonEmptyString,
  // References an existing SpecialistDefinition; registration is validated later.
  specialistId: nonEmptyString,
  // Goal-specific delegation, not the SpecialistDefinition's default objective.
  objective: nonEmptyString,
  contextPaths: z.array(nonEmptyString).min(1),
  rationale: nonEmptyString,
}).strict();

// Harness-owned proposal envelope. Parsing proves neither issuance nor approval.
// Finalization must supply IDs, the original Goal, and the captured Snapshot.
export const staffingProposalSchema = z.object({
  id: nonEmptyString,
  goal: goalSpecSchema.strict(),
  snapshot: repositorySnapshotSchema,
  intent: intentAnalysisSchema,
  assignments: z.array(staffingAssignmentSchema).min(1),
  budget: z.object({ maxAgentInvocations: z.number().int().positive() }).strict(),
  rationale: nonEmptyString,
}).strict();

export type IntentAnalysis = z.infer<typeof intentAnalysisSchema>;
export type StaffingAssignment = z.infer<typeof staffingAssignmentSchema>;
export type StaffingProposal = z.infer<typeof staffingProposalSchema>;
