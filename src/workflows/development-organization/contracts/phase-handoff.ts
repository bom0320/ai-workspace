import { z } from "zod";
import {
  approvedDecisionSchema,
  executionDelegationSchema,
} from "@/application/governance/index.js";

export const phaseBHandoffSchema = z
  .object({
    status: z.literal("completed"),
    decision: approvedDecisionSchema,
    executionDelegation: executionDelegationSchema,
  })
  .strict();
export type PhaseBHandoff = z.infer<typeof phaseBHandoffSchema>;

export const phaseACompletionSchema = z.discriminatedUnion("status", [
  phaseBHandoffSchema,
  z
    .object({
      status: z.enum(["incomplete", "blocked", "denied", "rejected"]),
      reason: z.string().min(1),
    })
    .strict(),
]);
