import { requireCurrentSystemRecord } from "../../../system-policy/flow/validation/system-configuration.js";
import type { InspectedFile } from "@/contracts/repository/inspected-file.js";
import { readCurrentStaffingDelegation } from "../../../human-delegation/flow/validation/delegation-configuration.js";
import { isContextPathAllowed } from "@/services/repository-inspection/index.js";
import { realpathSync } from "node:fs";
import {
  validateStaffingProposal,
  type StaffingProposal,
} from "@/application/staffing/index.js";
import type { RepositoryGovernance } from "../../../../../model/ledger.js";

// Current proposal validity is shared by new approval and stored issuance checks.
// It does not select an approval source or authenticate proposal issuance.
export function validateCurrentStaffingPolicy(
  proposal: StaffingProposal,
  repository: RepositoryGovernance
): InspectedFile[] {
  const system = repository.systems.at(-1);
  if (!system) throw new Error("Missing System Policy.");
  const configuration = requireCurrentSystemRecord(
    system,
    realpathSync(proposal.snapshot.repositoryRoot)
  );
  return validateStaffingProposal(proposal, configuration);
}

// A new approval must also evaluate the current delegation lifecycle.
export function evaluateStaffingApproval(
  proposal: StaffingProposal,
  repository: RepositoryGovernance,
  now: number
): "delegated" | "direct" {
  validateCurrentStaffingPolicy(proposal, repository);
  return evaluateDelegationCoverage(proposal, repository, now);
}

// Internal policy evaluation after current Proposal validation. Both new and
// stored approval reuse this rule; file validation remains a separate concern.
export function evaluateDelegationCoverage(
  proposal: StaffingProposal,
  repository: RepositoryGovernance,
  now: number
): "delegated" | "direct" {
  const input = readCurrentStaffingDelegation(repository, now);
  if (!input) return "direct";
  const automaticContext = { allowedScopes: input.delegatedContextScopes };
  const withinDelegatedScope =
    proposal.budget.maxAgentInvocations <= input.maxAgentInvocations &&
    proposal.assignments.every(
      (assignment) =>
        input.allowedSpecialistIds.includes(assignment.specialistId) &&
        assignment.contextPaths.every((path) =>
          isContextPathAllowed(path, automaticContext)
        )
    );
  return withinDelegatedScope ? "delegated" : "direct";
}
