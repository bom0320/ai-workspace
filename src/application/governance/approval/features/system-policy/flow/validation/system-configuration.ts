import type { RepositoryGovernance } from "../../../../../model/ledger.js";
import { requireCurrentSystemPolicy } from "../../model/policy.js";
import { resolveGovernanceRepository } from "../../../../../records/governance-transaction.js";
import { validateContextAccessPolicy } from "@/services/repository-inspection/index.js";
import {
  staffingSystemPolicySchema,
  type StaffingSystemPolicy,
} from "../../model/policy.js";

export function validateSystemConfiguration(
  input: unknown
): StaffingSystemPolicy {
  const configuration = staffingSystemPolicySchema.parse(input);
  configuration.repositoryRoot = resolveGovernanceRepository(
    configuration.repositoryRoot
  );
  validateContextAccessPolicy(configuration.contextAccessPolicy);
  return configuration;
}

// Shared current-record checks for policy queries and Proposal/Scope validation.
export function requireCurrentSystemRecord(
  system: RepositoryGovernance["systems"][number],
  repositoryRoot: string,
  now = Date.now()
): StaffingSystemPolicy {
  if (
    system.configuration.repositoryRoot !== repositoryRoot ||
    system.approval.uid !== process.getuid?.() ||
    Date.parse(system.approval.confirmedAt) > now
  )
    throw new Error("Invalid System Policy approval or Repository binding.");
  return requireCurrentSystemPolicy(system.configuration);
}
