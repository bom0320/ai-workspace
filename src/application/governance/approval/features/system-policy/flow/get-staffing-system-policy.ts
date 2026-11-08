import { governanceDigest } from "@/services/governance-records/index.js";
import { withGovernanceLedger } from "../../../shared/records/governance-transaction.js";
import { resolveGovernanceRepository } from "../../../shared/validation/approval-input.js";
import {
  requireCurrentSystemPolicy,
  type StaffingSystemPolicy,
} from "../model/policy.js";
import { validateSystemConfiguration } from "./validation/system-configuration.js";

export type StaffingSystemPolicyResult =
  | { status: "ready"; configuration: StaffingSystemPolicy; version: number }
  | { status: "denied"; reason: string };

// Return a detached configuration under a short authenticated read transaction.
// The caller must not keep the ledger locked while an Agent or Human responds.
export function getStaffingSystemPolicy(
  repositoryPath: string
): StaffingSystemPolicyResult {
  try {
    const root = resolveGovernanceRepository(repositoryPath);
    return withGovernanceLedger((ledger) => {
      const system =
        ledger.repositories[governanceDigest(root)]?.systems.at(-1);
      if (!system) throw new Error("Missing System Policy.");
      const configuration = requireCurrentSystemPolicy(system.configuration);
      if (
        configuration.repositoryRoot !== root ||
        system.approval.uid !== process.getuid?.() ||
        Date.parse(system.approval.confirmedAt) > Date.now()
      )
        throw new Error(
          "Invalid System Policy approval or Repository binding."
        );
      return {
        status: "ready",
        configuration: validateSystemConfiguration(configuration),
        version: system.version,
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
