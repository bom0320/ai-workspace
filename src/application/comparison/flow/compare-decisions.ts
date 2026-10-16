import {
  runCodexComparator,
  type CodexComparatorOptions,
} from "../comparator/codex-comparator.js";
import type { ComparisonResult } from "../model/comparison.js";
import type { ComparisonContext } from "../protocol/context.js";
import { validateComparisonReferences } from "./validation/validate-references.js";

export async function compareDecisions(
  context: ComparisonContext,
  options: CodexComparatorOptions = {},
): Promise<ComparisonResult> {
  if (context.decisions.length < 2) {
    throw new Error("Comparison requires at least two decisions.");
  }
  const specialistIds = new Set<string>();
  for (const decision of context.decisions) {
    if (specialistIds.has(decision.specialistId)) {
      throw new Error(`Duplicate comparison source specialist: ${decision.specialistId}.`);
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
