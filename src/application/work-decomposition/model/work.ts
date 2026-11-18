import { z } from "zod";

const text = z.string().trim().min(1);

export const workItemSchema = z
  .object({
    // IDs are local labels for this proposal's dependency references.
    id: text,
    objective: text,
    deliverable: text,
    dependsOn: z.array(text),
    rationale: text,
    suggestedRoles: z.array(text).optional(),
  })
  .strict();

export type WorkItem = z.infer<typeof workItemSchema>;

export const workItemsSchema = z.array(workItemSchema).min(1);
