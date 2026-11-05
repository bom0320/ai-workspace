import { requireCurrentSystemPolicy } from "../../system-policy/model/policy.js";
import { randomUUID } from "node:crypto";
import type { HumanConfirmation } from "@/infrastructure/terminal/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import {
  humanDelegationPolicyInputSchema,
  humanDelegationPolicySchema,
} from "../model/policy.js";
import {
  deniedStaffingApproval,
  type StaffingApprovalResult,
} from "../../../shared/model/result.js";
import { withGovernanceLedger } from "../../../shared/records/governance-transaction.js";
import {
  consumeCurrentHumanConfirmation,
  resolveGovernanceRepository,
} from "../../../shared/validation/approval-input.js";
import { validateDelegationConfiguration } from "./validation/delegation-configuration.js";

export function configureHumanDelegation(
  repositoryPath: string,
  input: unknown,
  receipt?: HumanConfirmation
): StaffingApprovalResult {
  try {
    const root = resolveGovernanceRepository(repositoryPath);
    const policy =
      input === null ? null : humanDelegationPolicyInputSchema.parse(input);
    return withGovernanceLedger((ledger, save) => {
      const entry = ledger.repositories[governanceDigest(root)];
      const system = entry?.systems.at(-1);
      if (!system) return deniedStaffingApproval();
      const previous = entry.delegations.at(-1);
      if (!policy && !previous) return deniedStaffingApproval();
      if (policy)
        validateDelegationConfiguration(
          policy,
          requireCurrentSystemPolicy(system.configuration)
        );
      const version = (previous?.version ?? 0) + 1;
      const binding = governanceDigest({
        action: "configure-delegation",
        root,
        policy,
        version,
        systemVersion: system.version,
      });
      const evidence = consumeCurrentHumanConfirmation(receipt, binding);
      if (receipt && !evidence) return deniedStaffingApproval();
      if (!evidence)
        return {
          status: "approval-required",
          kind: "delegation",
          subject: policy,
          binding,
          reason: policy
            ? "Human approval required to establish or replace delegation."
            : "Human confirmation required to revoke delegation.",
        };
      if (previous?.status === "active") previous.status = "superseded";
      const next = humanDelegationPolicySchema.parse({
        ...(policy ?? previous),
        id: previous?.id ?? `delegation-${randomUUID()}`,
        version,
        repositoryRoot: root,
        systemPolicyVersion: system.version,
        status: policy ? "active" : "revoked",
        approval: evidence,
      });
      entry.delegations.push(next);
      save();
      return { status: "configured", version };
    });
  } catch {
    return deniedStaffingApproval();
  }
}
