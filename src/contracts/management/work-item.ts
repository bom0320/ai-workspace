import { z } from "zod";
import { sourceReferenceSchema } from "./source-reference.js";

const text = z.string().trim().min(1);

export const workItemSchema = z
  .object({
    // IDs are local labels for this proposal's dependency references.
    id: text,
    objective: text,
    deliverable: text,
    dependsOn: z.array(text),
    // Why this work warrants its own execution unit.
    rationale: text.optional(),
    suggestedRoles: z.array(text).optional(),
    sources: z.array(sourceReferenceSchema).optional(),
  })
  .strict();

export type WorkItem = z.infer<typeof workItemSchema>;

export const workItemsSchema = z.array(workItemSchema).min(1);
