import { z } from "zod";
import {
  approvedDecisionSchema,
  executionDelegationSchema,
} from "@/application/governance/index.js";

export const phaseACompletedSchema = z
  .object({
    status: z.literal("completed"),
    decision: approvedDecisionSchema,
    executionDelegation: executionDelegationSchema,
  })
  .strict();
export type PhaseACompleted = z.infer<typeof phaseACompletedSchema>;
export type PhaseBHandoff = PhaseACompleted;

export const phaseACompletionSchema = z.discriminatedUnion("status", [
  phaseACompletedSchema,
  z
    .object({
      status: z.enum(["incomplete", "blocked", "denied", "rejected"]),
      reason: z.string().min(1),
    })
    .strict(),
]);
