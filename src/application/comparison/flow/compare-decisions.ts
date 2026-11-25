import { runCodexComparator } from "../comparator/codex-comparator.js";
import { type CodexComparatorOptions } from "../data-flow/input.js";
import type { ComparisonResult } from "../data-flow/output.js";
import type { ComparisonContext } from "../data-flow/input.js";
import { validateComparisonReferences } from "./validation/validate-references.js";

export async function compareDecisions(
  context: ComparisonContext,
  options: CodexComparatorOptions = {}
): Promise<ComparisonResult> {
  if (context.decisions.length < 2) {
    throw new Error("Comparison requires at least two decisions.");
  }
  const specialistIds = new Set<string>();
  for (const decision of context.decisions) {
    if (specialistIds.has(decision.specialistId)) {
      throw new Error(
        `Duplicate comparison source specialist: ${decision.specialistId}.`
      );
    }
    specialistIds.add(decision.specialistId);
  }
  if (!context.repositoryCommitSha.trim()) {
    throw new Error("Comparison repository commit SHA is required.");
  }

  const payload = await runCodexComparator(context, options);
  validateComparisonReferences(context, payload);
  return payload;
}
