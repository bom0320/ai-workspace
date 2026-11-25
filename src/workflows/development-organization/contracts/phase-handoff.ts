import { z } from "zod";
import { phaseBHandoffSchema } from "@/application/data-flow/phase-b/handoff/input.js";

export const phaseACompletionSchema = z.discriminatedUnion("status", [
  phaseBHandoffSchema,
  z
    .object({
      status: z.enum(["incomplete", "blocked", "denied", "rejected"]),
      reason: z.string().min(1),
    })
    .strict(),
]);
