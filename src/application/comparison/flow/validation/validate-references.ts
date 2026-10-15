import type { ComparisonPayload } from "../../protocol/comparison.js";
import type { ComparisonContext } from "../../protocol/context.js";

// The payload must already have passed Protocol schema validation.
export function validateComparisonReferences(
  context: ComparisonContext,
  payload: ComparisonPayload,
): void {
  const decisions = new Map(context.decisions.map((decision) => [decision.specialistId, decision]));

  for (const finding of payload.findings) {
    if (finding.positions.length < 2) {
      throw new Error(`Comparison finding requires at least two positions: ${finding.concern}.`);
    }
    const specialistIds = new Set<string>();
    for (const position of finding.positions) {
      const decision = decisions.get(position.specialistId);
      if (decision === undefined) {
        throw new Error(`Unknown comparison specialist: ${position.specialistId}.`);
      }
      if (specialistIds.has(position.specialistId)) {
        throw new Error(`Duplicate specialist in comparison finding: ${position.specialistId}.`);
      }
      specialistIds.add(position.specialistId);

      const evidenceIndexes = new Set<number>();
      for (const index of position.evidenceIndexes) {
        if (index >= decision.evidence.length) {
          throw new Error(`Comparison evidence index is out of range for specialist ${position.specialistId}: ${index}.`);
        }
        if (evidenceIndexes.has(index)) {
          throw new Error(`Duplicate comparison evidence index for specialist ${position.specialistId}: ${index}.`);
        }
        evidenceIndexes.add(index);
      }
    }
  }

  for (const gap of payload.gaps) {
    if (gap.specialistIds.length === 0) {
      throw new Error(`Comparison gap requires at least one specialist: ${gap.concern}.`);
    }
    const specialistIds = new Set<string>();
    for (const specialistId of gap.specialistIds) {
      if (!decisions.has(specialistId)) {
        throw new Error(`Unknown comparison gap specialist: ${specialistId}.`);
      }
      if (specialistIds.has(specialistId)) {
        throw new Error(`Duplicate specialist in comparison gap: ${specialistId}.`);
      }
      specialistIds.add(specialistId);
    }
  }
}
