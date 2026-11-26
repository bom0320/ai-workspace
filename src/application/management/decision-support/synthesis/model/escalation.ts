import { z } from "zod";
import { synthesisTextSchema, synthesisSourcesSchema } from "./proposal.js";

export const synthesisEscalationSchema = z
  .object({
    reason: synthesisTextSchema,
    questions: z.array(synthesisTextSchema).min(1),
    sources: synthesisSourcesSchema,
  })
  .strict();
