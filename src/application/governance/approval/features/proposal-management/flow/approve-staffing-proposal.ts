import {
  resolveGovernanceRepository,
  withGovernanceLedger,
} from "../../../../records/governance-transaction.js";
import { staffingProposalSchema } from "@/application/staffing/index.js";
import type { HumanConfirmation } from "@/infrastructure/terminal/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import {
  deniedStaffingApproval,
  type StaffingApprovalResult,
} from "../../../shared/model/result.js";

import { consumeCurrentHumanConfirmation } from "../../../shared/validation/approval-input.js";
import {
  assertProposalNotIssued,
  assertIssuanceIdsUnused,
} from "./validation/staffing-issuance.js";
import { evaluateStaffingApproval } from "./validation/evaluate-staffing-approval.js";
import { issueStaffingScope } from "./transformation/issue-staffing-scope.js";

export function approveStaffingProposal(
  input: unknown,
  receipt?: HumanConfirmation
): StaffingApprovalResult {
  try {
    const proposal = staffingProposalSchema.parse(input);
    const root = resolveGovernanceRepository(proposal.snapshot.repositoryRoot);
    return withGovernanceLedger((ledger, save) => {
      const entry = ledger.repositories[governanceDigest(root)];
      if (!entry) return deniedStaffingApproval();
      assertProposalNotIssued(entry, proposal.id);
      const mode = evaluateStaffingApproval(proposal, entry, Date.now());
      const system = entry.systems.at(-1)!;
      const delegation = entry.delegations.at(-1);
      const binding = governanceDigest({
        action: "approve-staffing",
        proposal,
        systemVersion: system.version,
        delegation: delegation
          ? {
              id: delegation.id,
              version: delegation.version,
              status: delegation.status,
            }
          : null,
      });
      const evidence =
        mode === "direct"
          ? consumeCurrentHumanConfirmation(receipt, binding)
          : undefined;
      if (receipt && mode === "direct" && !evidence)
        return deniedStaffingApproval();
      if (mode === "direct" && !evidence)
        return {
          status: "approval-required",
          kind: "staffing",
          subject: proposal,
          binding,
          reason:
            "No active delegation covers this Specialist, Context or invocation budget. Review all original Human Constraints; changes require a new validated Proposal.",
        };
      // Re-read policy/file facts as well as time-dependent delegation state.
      // The Ledger lock does not lock the external Repository or its Git objects.
      // Keep both freshness checks, before issuance and again before persistence.
      if (evaluateStaffingApproval(proposal, entry, Date.now()) !== mode)
        return deniedStaffingApproval();
      const issuance = issueStaffingScope(
        proposal,
        system.version,
        evidence
          ? {
              type: "direct-human",
              confirmation: evidence,
            }
          : {
              type: "human-delegation",
              delegationPolicyId: delegation!.id,
              delegationPolicyVersion: delegation!.version,
              delegationApprovalId: delegation!.approval.id,
            }
      );
      assertRepositoryMatchesSnapshot(proposal.snapshot);
      if (evaluateStaffingApproval(proposal, entry, Date.now()) !== mode)
        return deniedStaffingApproval();
      assertIssuanceIdsUnused(ledger, issuance);
      entry.issuances.push(issuance);
      save();
      return {
        status: "approved",
        approval: issuance.approval,
        scope: issuance.scope,
      };
    });
  } catch {
    return deniedStaffingApproval();
  }
}
