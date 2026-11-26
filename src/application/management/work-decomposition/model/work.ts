import { z } from "zod";
import {
  sourceReferenceSchema,
  validateAnalysisReferences,
  type SynthesisContext,
} from "@/application/management/decision-support/synthesis/index.js";

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

export function validateWorkItemSources(
  context: SynthesisContext,
  workItems: readonly WorkItem[]
) {
  for (const { sources } of workItems) {
    if (!sources?.length) continue;
    validateAnalysisReferences(context, sources);
    for (const source of sources) {
      if (
        "specialistId" in source &&
        context.decisions.filter(
          ({ specialistId }) => specialistId === source.specialistId
        ).length !== 1
      )
        throw new Error("Ambiguous Work Item source.");
    }
  }
}
