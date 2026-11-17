import type { AgentDecision } from "./protocol/decision.js";
import type { SpecialistContext } from "./protocol/context.js";
import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";
import { createHash } from "node:crypto";

type Provenance = {
  decision: AgentDecision;
  context: SpecialistContext;
  snapshot: RepositorySnapshot;
};
const results = new WeakMap<
  object,
  { digest: string; provenance: Provenance }
>();
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Only the Application's successful validation path creates this process-local receipt.
// Object identity and an immutable copy prevent Graph/checkpoint data from forging it.
export function rememberValidatedDecision(
  result: AgentDecision,
  provenance: Provenance
): void {
  results.set(result, {
    digest: digest(result),
    provenance: structuredClone(provenance),
  });
}

export function consumeValidatedDecision(result: AgentDecision): Provenance {
  const record = results.get(result);
  results.delete(result);
  if (!record || record.digest !== digest(result))
    throw new Error("Untrusted or already consumed decision result.");
  return structuredClone(record.provenance);
}
