import type { ComparisonResult } from "./model/comparison.js";
import type { ComparisonContext } from "./protocol/context.js";
import { createHash } from "node:crypto";

type Provenance = { comparison: ComparisonResult; context: ComparisonContext };
const results = new WeakMap<
  object,
  { digest: string; provenance: Provenance }
>();
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Only the Application's successful validation path creates this process-local receipt.
// Object identity and an immutable copy prevent Graph/checkpoint data from forging it.
export function rememberValidatedComparison(
  result: ComparisonResult,
  provenance: Provenance
): void {
  results.set(result, {
    digest: digest(result),
    provenance: structuredClone(provenance),
  });
}

export function consumeValidatedComparison(
  result: ComparisonResult
): Provenance {
  const record = results.get(result);
  results.delete(result);
  if (!record || record.digest !== digest(result))
    throw new Error("Untrusted or already consumed comparison result.");
  return structuredClone(record.provenance);
}
