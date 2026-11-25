import type { RefinementBasis } from "../../../../data-flow/analysis-refinement/input.js";
import {
  resolveGovernanceRepository,
  withGovernanceLedger,
} from "../../../../records/governance-transaction.js";

import { staffingProposalSchema } from "@/application/staffing/index.js";
import type { HumanConfirmation } from "@/infrastructure/terminal/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";

import { deniedStaffingApproval } from "../../../shared/model/result.js";
import { type StaffingApprovalResult } from "../../../../data-flow/staffing-approval/output.js";

import { consumeCurrentHumanConfirmation } from "../../../shared/validation/approval-input.js";
import {
  assertProposalNotIssued,
  assertIssuanceIdsUnused,
} from "./validation/staffing-issuance.js";
import { evaluateStaffingApproval } from "./validation/evaluate-staffing-approval.js";
import { issueStaffingScope } from "./transformation/issue-staffing-scope.js";
import { requireCurrentSystemPolicy } from "../../system-policy/model/policy.js";
import {
  assertRefinementAvailable,
  verifyAnalysisSources,
} from "../../../../records/analysis/analysis-provenance.js";
import { projectRefinementRequests } from "../../../../records/analysis/refinement-records.js";
import { analysisRefinementSchema } from "../../../../model/analysis-refinement.js";

export function approveStaffingProposal(
  input: unknown,
  receipt?: HumanConfirmation
): StaffingApprovalResult {
  return approveProposal(input, receipt);
}

export function approveRefinementProposal(
  input: unknown,
  basis: RefinementBasis,
  receipt?: HumanConfirmation
): StaffingApprovalResult {
  return approveProposal(input, receipt, basis);
}

function approveProposal(
  input: unknown,
  receipt: HumanConfirmation | undefined,
  refinement?: RefinementBasis
): StaffingApprovalResult {
  try {
    // 1. Validate Proposal and Repository

    const proposal = staffingProposalSchema.parse(input);
    if (Boolean(proposal.refinement) !== Boolean(refinement))
      return deniedStaffingApproval();
    const root = resolveGovernanceRepository(proposal.snapshot.repositoryRoot);

    return withGovernanceLedger((ledger, save) => {
      const entry = ledger.repositories[governanceDigest(root)];

      if (!entry) {
        return deniedStaffingApproval();
      }

      assertProposalNotIssued(entry, proposal.id);
      const linkage = proposal.refinement;
      if (linkage && refinement) {
        const initial = assertRefinementAvailable(
          entry,
          linkage.rootScopeId,
          linkage.changeDigest,
          proposal.assignments.length
        );
        if (
          governanceDigest(initial.scope.goal) !==
            governanceDigest(proposal.goal) ||
          governanceDigest(initial.scope.snapshot) !==
            governanceDigest(proposal.snapshot) ||
          proposal.budget.maxAgentInvocations !== proposal.assignments.length ||
          proposal.budget.maxTotalAnalysisInvocations !== undefined ||
          linkage.basisDigest !== governanceDigest(refinement.context) ||
          linkage.assessmentDigest !== governanceDigest(refinement.assessment)
        )
          return deniedStaffingApproval();
        verifyAnalysisSources(
          entry,
          linkage.rootScopeId,
          refinement.context,
          refinement.invocationIds,
          true
        );
      }

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
            },
        requireCurrentSystemPolicy(system.configuration).analysis
      );

      // 7. Verify Snapshot and Policy Before Persistence

      assertRepositoryMatchesSnapshot(proposal.snapshot);

      if (evaluateStaffingApproval(proposal, entry, Date.now()) !== mode) {
        return deniedStaffingApproval();
      }

      assertIssuanceIdsUnused(ledger, issuance);

      // 8. Persist Issuance

      entry.issuances.push(issuance);
      if (linkage) {
        const { scope } = issuance;
        (entry.analysisRefinements ??= []).push(
          analysisRefinementSchema.parse({
            ...linkage,
            requests: projectRefinementRequests(scope),
          })
        );
      }
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
