import { z } from "zod";

export const evidenceReferenceSchema = z.object({
  path: z.string().min(1),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  description: z.string().min(1),
}).strict();

export const agentDecisionSchema = z.object({
  specialistId: z.string().min(1),
  recommendation: z.string().min(1),
  evidence: z.array(evidenceReferenceSchema),
  risks: z.array(z.string().min(1)),
  uncertainty: z.array(z.string().min(1)),
}).strict();

export const agentDecisionPayloadSchema = agentDecisionSchema.omit({
  specialistId: true,
});

export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;
export type AgentDecision = z.infer<typeof agentDecisionSchema>;
