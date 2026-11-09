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
    // 1. Validate Proposal and Repository

    const proposal = staffingProposalSchema.parse(input);
    const root = resolveGovernanceRepository(proposal.snapshot.repositoryRoot);

    return withGovernanceLedger((ledger, save) => {
      const entry = ledger.repositories[governanceDigest(root)];

      if (!entry) {
        return deniedStaffingApproval();
      }

      assertProposalNotIssued(entry, proposal.id);

      // 2. Evaluate Approval Policy

      const mode = evaluateStaffingApproval(proposal, entry, Date.now());

      const system = entry.systems.at(-1)!;
      const delegation = entry.delegations.at(-1);

      // 3. Build Approval Binding

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

      // 4. Verify Human Confirmation (Direct Approval)

      const evidence =
        mode === "direct"
          ? consumeCurrentHumanConfirmation(receipt, binding)
          : undefined;

      if (receipt && mode === "direct" && !evidence) {
        return deniedStaffingApproval();
      }

      if (mode === "direct" && !evidence) {
        return {
          status: "approval-required",
          kind: "staffing",
          subject: proposal,
          binding,
          reason:
            "No active delegation covers this Specialist, Context or invocation budget. Review all original Human Constraints; changes require a new validated Proposal.",
        };
      }

      // 5. Revalidate Before Issuance

      if (evaluateStaffingApproval(proposal, entry, Date.now()) !== mode) {
        return deniedStaffingApproval();
      }

      // 6. Issue Approval Record and Operating Scope

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

      // 7. Verify Snapshot and Policy Before Persistence

      assertRepositoryMatchesSnapshot(proposal.snapshot);

      if (evaluateStaffingApproval(proposal, entry, Date.now()) !== mode) {
        return deniedStaffingApproval();
      }

      assertIssuanceIdsUnused(ledger, issuance);

      // 8. Persist Issuance

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
