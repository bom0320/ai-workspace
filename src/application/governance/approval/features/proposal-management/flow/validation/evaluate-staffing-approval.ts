import { requireCurrentSystemPolicy } from "../../../system-policy/model/policy.js";
import {
  resolveContextAccessPolicy,
  isContextPathAllowed,
} from "@/services/repository-inspection/index.js";
import { realpathSync } from "node:fs";
import {
  validateStaffingProposal,
  type StaffingProposal,
} from "@/application/staffing/index.js";
import type { RepositoryGovernance } from "../../../../shared/model/ledger.js";

// Current proposal validity is shared by new approval and stored issuance checks.
// It does not select an approval source or authenticate proposal issuance.
export function validateCurrentStaffingPolicy(
  proposal: StaffingProposal,
  repository: RepositoryGovernance
): void {
  const system = repository.systems.at(-1);
  if (
    !system ||
    system.configuration.repositoryRoot !==
      realpathSync(proposal.snapshot.repositoryRoot)
  )
    throw new Error("Missing or mismatched System Policy.");
  const configuration = requireCurrentSystemPolicy(system.configuration);
  validateStaffingProposal(proposal, configuration);
}

// A new approval must also evaluate the current delegation lifecycle.
export function evaluateStaffingApproval(
  proposal: StaffingProposal,
  repository: RepositoryGovernance,
  now: number
): "delegated" | "direct" {
  validateCurrentStaffingPolicy(proposal, repository);
  const system = repository.systems.at(-1)!;
  const delegation = repository.delegations.at(-1);
  if (!delegation) return "direct";
  if (
    delegation.repositoryRoot !== system.configuration.repositoryRoot ||
    delegation.systemPolicyVersion !== system.version
  )
    throw new Error(
      "Delegation is inactive, expired or no longer matches System Policy."
    );
  if (
    delegation.status !== "active" ||
    Date.parse(delegation.expiresAt) <= now ||
    Date.parse(delegation.approval.confirmedAt) > now
  )
    throw new Error(
      "Delegation is inactive, expired or no longer matches System Policy."
    );
  const accessPolicy = resolveContextAccessPolicy(delegation);
  const withinDelegatedScope =
    proposal.budget.maxAgentInvocations <= delegation.maxAgentInvocations &&
    proposal.assignments.every(
      (assignment) =>
        delegation.allowedSpecialistIds.includes(assignment.specialistId) &&
        assignment.contextPaths.every((path) =>
          isContextPathAllowed(path, accessPolicy)
        )
    );
  return withinDelegatedScope ? "delegated" : "direct";
}
