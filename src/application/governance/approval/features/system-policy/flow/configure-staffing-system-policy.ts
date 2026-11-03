import type { HumanConfirmation } from "@/infrastructure/terminal/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import {
  deniedStaffingApproval,
  type StaffingApprovalResult,
} from "../../../shared/model/result.js";
import { withGovernanceLedger } from "../../../shared/records/governance-transaction.js";
import { consumeCurrentHumanConfirmation } from "../../../shared/validation/approval-input.js";
import { validateSystemConfiguration } from "./validation/system-configuration.js";

export function configureStaffingSystemPolicy(
  input: unknown,
  receipt?: HumanConfirmation
): StaffingApprovalResult {
  try {
    const configuration = validateSystemConfiguration(input);
    return withGovernanceLedger((ledger, save) => {
      const key = governanceDigest(configuration.repositoryRoot);
      const entry = ledger.repositories[key] ?? {
        systems: [],
        delegations: [],
        issuances: [],
      };
      const version = (entry.systems.at(-1)?.version ?? 0) + 1;
      const binding = governanceDigest({
        action: "configure-system",
        configuration,
        version,
      });
      const evidence = consumeCurrentHumanConfirmation(receipt, binding);
      if (receipt && !evidence) return deniedStaffingApproval();
      if (!evidence)
        return {
          status: "approval-required",
          kind: "system-policy",
          subject: configuration,
          binding,
          reason:
            "Human configuration and approval required for System Policy.",
        };
      entry.systems.push({ configuration, version, approval: evidence });
      ledger.repositories[key] = entry;
      save();
      return { status: "configured", version };
    });
  } catch {
    return deniedStaffingApproval();
  }
}
