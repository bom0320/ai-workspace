import { z } from "zod";

const text = z.string().trim().min(1);

export const workItemSchema = z
  .object({
    // IDs are local labels for this proposal's dependency references.
    id: text,
    // Selects the single execution route supported today. Older proposals may omit it.
    workType: z.enum(["read-only", "repository-modification"]).optional(),
    objective: text,
    deliverable: text,
    dependsOn: z.array(text),
    // Why this work warrants its own execution unit.
    rationale: text.optional(),
    suggestedRoles: z.array(text).optional(),
  })
  .strict();

export type WorkItem = z.infer<typeof workItemSchema>;

export const workItemsSchema = z.array(workItemSchema).min(1);
