import type { HumanConfirmation } from "@/infrastructure/terminal/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import {
  resolveGovernanceRepository,
  withGovernanceLedger,
} from "../../../../records/governance-transaction.js";
import { consumeCurrentHumanConfirmation } from "../../../shared/validation/approval-input.js";
import {
  codexWorktreeModeNotice,
  executionSystemPolicySchema,
  type ExecutionSystemPolicy,
} from "../model/execution-system-policy.js";
import { executionPolicyBinding } from "./validation/execution-policy-configuration.js";

type ConfigurationResult =
  | {
      status: "confirmation-required";
      binding: string;
      repositoryRoot: string;
      policy: ExecutionSystemPolicy | null;
      workerModeNotice?: string;
      version: number;
    }
  | { status: "configured"; version: number }
  | { status: "denied" };

export function configureExecutionSystemPolicy(
  repositoryPath: string,
  input: unknown,
  receipt?: HumanConfirmation
): ConfigurationResult {
  let consumed = false;
  try {
    const repositoryRoot = resolveGovernanceRepository(repositoryPath);
    const policy = executionSystemPolicySchema.nullable().parse(input);
    return withGovernanceLedger((ledger, save): ConfigurationResult => {
      const key = governanceDigest(repositoryRoot);
      const entry = ledger.repositories[key] ?? {
        systems: [],
        delegations: [],
        issuances: [],
      };
      const version = (entry.executionPolicies?.at(-1)?.version ?? 0) + 1;
      const binding = executionPolicyBinding(repositoryRoot, version, policy);
      if (!receipt)
        return {
          status: "confirmation-required",
          binding,
          repositoryRoot,
          policy,
          ...(policy?.workerMode && {
            workerModeNotice: codexWorktreeModeNotice,
          }),
          version,
        };
      consumed = true;
      const approval = consumeCurrentHumanConfirmation(receipt, binding);
      if (!approval) return { status: "denied" };
      (entry.executionPolicies ??= []).push({
        version,
        repositoryRoot,
        policy,
        binding,
        approval,
        configuredAt: new Date().toISOString(),
      });
      ledger.repositories[key] = entry;
      save();
      return { status: "configured", version };
    });
  } catch {
    return { status: "denied" };
  } finally {
    if (receipt && !consumed) consumeCurrentHumanConfirmation(receipt, "");
  }
}
