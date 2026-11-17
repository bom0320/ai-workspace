import type { SynthesisProposal } from "./model/proposal.js";
import type { SynthesisResult } from "./model/result.js";
import type { SynthesisContext } from "./protocol/context.js";
import { createHash } from "node:crypto";

type Provenance = { proposal: SynthesisProposal; context: SynthesisContext };
const results = new WeakMap<
  object,
  { digest: string; provenance: Provenance }
>();
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Only the Application's successful validation path creates this process-local receipt.
// Object identity and an immutable copy prevent Graph/checkpoint data from forging it.
export function rememberValidatedSynthesis(
  result: Extract<SynthesisResult, { status: "proposed" }>,
  provenance: Provenance
): void {
  results.set(result, {
    digest: digest(result),
    provenance: structuredClone(provenance),
  });
}

export function consumeValidatedSynthesis(
  result: Extract<SynthesisResult, { status: "proposed" }>
): Provenance {
  const record = results.get(result);
  results.delete(result);
  if (!record || record.digest !== digest(result))
    throw new Error("Untrusted or already consumed synthesis result.");
  return structuredClone(record.provenance);
}
