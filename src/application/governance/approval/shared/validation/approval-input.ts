import { realpathSync } from "node:fs";
import { resolveRepositoryRoot } from "@/infrastructure/git/index.js";
import {
  consumeHumanConfirmation,
  type HumanConfirmation,
} from "@/infrastructure/terminal/index.js";
import { assertGovernanceStoreOutsideRepository } from "@/services/governance-records/index.js";

export function resolveGovernanceRepository(input: string): string {
  const root = realpathSync(resolveRepositoryRoot(input));
  assertGovernanceStoreOutsideRepository(root);
  return root;
}

// Consuming is intentional even when the binding, UID or time check fails:
// a rejected receipt must not be reusable by another approval attempt.
export function consumeCurrentHumanConfirmation(
  receipt: HumanConfirmation | undefined,
  binding: string
) {
  const evidence = consumeHumanConfirmation(receipt, binding);
  if (
    !evidence ||
    evidence.uid !== process.getuid?.() ||
    Date.now() - Date.parse(evidence.confirmedAt) > 5 * 60_000 ||
    Date.parse(evidence.confirmedAt) > Date.now()
  )
    return undefined;
  return evidence;
}
