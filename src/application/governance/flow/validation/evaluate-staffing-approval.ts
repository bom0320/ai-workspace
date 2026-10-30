import { realpathSync } from "node:fs";
import {
  validateStaffingProposal,
  type StaffingProposal,
} from "@/application/staffing/index.js";
import type { RepositoryGovernance } from "../../model/approval.js";

// Inputs originate only from the authenticated local ledger in the use-case.
// This evaluation alone is not an approval receipt or execution authorization.
export function evaluateStaffingApproval(
  proposal: StaffingProposal,
  repository: RepositoryGovernance,
  now: number
): "delegated" | "direct" {
  const system = repository.systems.at(-1);
  if (
    !system ||
    system.configuration.repositoryRoot !==
      realpathSync(proposal.snapshot.repositoryRoot)
  )
    throw new Error("Missing or mismatched System Policy.");
  const {
    repositoryRoot: _root,
    phase: _phase,
    ...configuration
  } = system.configuration;
  validateStaffingProposal(proposal, configuration);
  const delegation = repository.delegations.at(-1);
  if (!delegation) return "direct";
  if (
    delegation.repositoryRoot !== system.configuration.repositoryRoot ||
    delegation.status !== "active" ||
    Date.parse(delegation.expiresAt) <= now ||
    Date.parse(delegation.approval.confirmedAt) > now ||
    delegation.systemPolicyVersion !== system.version
  )
    throw new Error(
      "Delegation is inactive, expired or no longer matches System Policy."
    );
  const within =
    proposal.budget.maxAgentInvocations <= delegation.maxAgentInvocations &&
    proposal.assignments.every(
      (assignment) =>
        delegation.allowedSpecialistIds.includes(assignment.specialistId) &&
        assignment.contextPaths.every((path) =>
          delegation.allowedContextPaths.includes(path)
        )
    );
  return within ? "delegated" : "direct";
}
