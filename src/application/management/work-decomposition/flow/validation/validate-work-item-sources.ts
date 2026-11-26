import type { WorkItem } from "@/contracts/management/work-item.js";
import {
  validateAnalysisReferences,
  type SynthesisContext,
} from "@/application/management/decision-support/synthesis/index.js";

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
