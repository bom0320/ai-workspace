import { realpathSync } from "node:fs";
import { resolveRepositoryRoot } from "@/infrastructure/git/index.js";
import {
  consumeHumanConfirmation,
  type HumanConfirmation,
} from "@/infrastructure/terminal/index.js";
import { assertGovernanceStoreOutsideRepository } from "@/services/governance-records/index.js";
import { isUnambiguousRepositoryPath } from "@/services/repository-inspection/index.js";
import {
  staffingSystemPolicySchema,
  type HumanDelegationPolicyInput,
  type StaffingSystemPolicy,
} from "../../model/approval.js";

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

export function validateSystemConfiguration(
  input: unknown
): StaffingSystemPolicy {
  const configuration = staffingSystemPolicySchema.parse(input);
  configuration.repositoryRoot = resolveGovernanceRepository(
    configuration.repositoryRoot
  );
  const specialists = configuration.availableSpecialists;
  if (new Set(specialists.map(({ id }) => id)).size !== specialists.length)
    throw new Error("System Policy requires unique Specialist registrations.");
  if (
    specialists.some(
      ({ authority }) =>
        authority.repositoryAccess !== "read" || authority.shellExecution
    )
  )
    throw new Error("System Policy is restricted to read-only analysis.");
  if (
    configuration.allowedContextPaths.some(
      (path) => !isUnambiguousRepositoryPath(path)
    )
  )
    throw new Error("System Policy requires unambiguous Context paths.");
  return configuration;
}

// A delegation may narrow the configured system boundaries, never expand them.
export function validateDelegationConfiguration(
  policy: HumanDelegationPolicyInput,
  system: StaffingSystemPolicy
): void {
  if (Date.parse(policy.expiresAt) <= Date.now())
    throw new Error("Delegation has expired.");
  if (
    new Set(policy.allowedSpecialistIds).size !==
      policy.allowedSpecialistIds.length ||
    policy.allowedSpecialistIds.some(
      (id) =>
        !system.availableSpecialists.some((specialist) => specialist.id === id)
    )
  )
    throw new Error("Delegation must reference unique registered Specialists.");
  if (
    policy.allowedContextPaths.some(
      (path) =>
        !isUnambiguousRepositoryPath(path) ||
        !system.allowedContextPaths.includes(path)
    )
  )
    throw new Error("Delegation Context must stay inside System Policy.");
  if (policy.maxAgentInvocations > system.policy.maxAgentInvocations)
    throw new Error("Delegation budget exceeds System Policy.");
}
