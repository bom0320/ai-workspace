import { z } from "zod";
import { workItemSchema } from "@/application/management/work-decomposition/index.js";
const text = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const executionDecompositionSchema = z
  .object({
    binding: digest,
    approvedDecisionId: text,
    approvalBinding: digest,
    workItems: z.array(workItemSchema).min(1),
  })
  .strict();
