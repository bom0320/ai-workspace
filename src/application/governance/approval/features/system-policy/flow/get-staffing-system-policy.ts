import type { StaffingSystemPolicyResult } from "../../../../data-flow/system-policy/output.js";
import {
  resolveGovernanceRepository,
  withGovernanceLedger,
} from "../../../../records/governance-transaction.js";
import { governanceDigest } from "@/services/governance-records/index.js";

import type { StaffingAssignmentConstraints } from "@/application/management/allocation/analysis-assignment/index.js";
import type { RepositoryGovernance } from "../../../../model/ledger.js";
import { readCurrentStaffingDelegation } from "../../human-delegation/flow/validation/delegation-configuration.js";
import {
  validateSystemConfiguration,
  requireCurrentSystemRecord,
} from "./validation/system-configuration.js";

// Return a detached configuration under a short authenticated read transaction.
// The caller must not keep the ledger locked while an Agent or Human responds.
export function getStaffingSystemPolicy(
  repositoryPath: string,
  includeDelegationConstraints = false
): StaffingSystemPolicyResult {
  try {
    const root = resolveGovernanceRepository(repositoryPath);
    return withGovernanceLedger((ledger) => {
      const entry = ledger.repositories[governanceDigest(root)];
      const system = entry?.systems.at(-1);
      if (!system) throw new Error("Missing System Policy.");
      const configuration = requireCurrentSystemRecord(system, root);
      const assignmentConstraints = includeDelegationConstraints
        ? readAssignmentConstraints(entry)
        : undefined;
      return {
        status: "ready",
        configuration: validateSystemConfiguration(configuration),
        version: system.version,
        ...(assignmentConstraints && { assignmentConstraints }),
      };
    });
  } catch {
    return {
      status: "denied",
      reason:
        "System Policy unavailable: configure a current Human-approved policy for this Repository and check trusted records. Legacy policies require explicit Human reapproval.",
    };
  }
}

function readAssignmentConstraints(
  entry: RepositoryGovernance
): StaffingAssignmentConstraints | undefined {
  try {
    const delegation = readCurrentStaffingDelegation(entry, Date.now());
    if (!delegation) return;
    const {
      allowedSpecialistIds,
      delegatedContextScopes,
      maxAgentInvocations,
      maxTotalAnalysisInvocations,
    } = delegation;
    return {
      allowedSpecialistIds,
      delegatedContextScopes,
      maxAgentInvocations,
      ...(maxTotalAnalysisInvocations !== undefined && {
        maxTotalAnalysisInvocations,
      }),
    };
  } catch {
    // The System Policy remains usable for discovery; approval rechecks delegation.
    return undefined;
  }
}
