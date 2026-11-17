import { validateComparisonReferences } from "@/application/comparison/index.js";
import type { SynthesisContext } from "../../protocol/context.js";

export function validateSynthesisContext(context: SynthesisContext): void {
  const assignmentIds = new Set(context.assignments.map((a) => a.assignmentId));
  const specialists = new Set(context.assignments.map((a) => a.specialistId));
  const decisionIds = new Set(context.decisions.map((d) => d.specialistId));
  if (
    assignmentIds.size !== context.assignments.length ||
    specialists.size !== context.assignments.length ||
    decisionIds.size !== context.decisions.length ||
    decisionIds.size !== specialists.size ||
    context.decisions.some((d) => !specialists.has(d.specialistId))
  )
    throw new Error(
      "Synthesis requires exactly one Decision per approved Assignment."
    );
  if (context.comparison.status === "skipped") {
    if (context.decisions.length !== 1)
      throw new Error("Only a single Decision may skip Comparison.");
  } else {
    if (context.decisions.length < 2)
      throw new Error("Completed Comparison requires multiple Decisions.");
    validateComparisonReferences(context, context.comparison.comparison);
  }
}
