import {
  validateWorkItemSources,
  type WorkDecompositionResult,
} from "@/application/work-decomposition/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { resolveApprovedDecision } from "../approval/features/direction-review/flow/approved-decision.js";
import type { RepositoryGovernance } from "../model/ledger.js";
import { withGovernanceLedger } from "./governance-transaction.js";

type Proposal = Extract<WorkDecompositionResult, { status: "proposed" }>;

function decompositionSubject(proposal: Proposal, approvalBinding: string) {
  return {
    approvedDecisionId: proposal.approvedDecisionId,
    approvalBinding,
    workItems: proposal.workItems,
  };
}

export function findRegisteredWorkDecomposition(
  entry: RepositoryGovernance,
  proposal: Proposal,
  approvalBinding: string
) {
  const binding = governanceDigest(
    decompositionSubject(proposal, approvalBinding)
  );
  return entry.executionDecompositions?.find(
    (record) => record.binding === binding
  );
}

// Phase B can return a decomposition when registration is unavailable.
// Assignment Plan registration and authorization still require the stored record.
export function registerWorkDecomposition(proposal: Proposal): void {
  try {
    withGovernanceLedger((ledger, save) => {
      const { entry, decision, context } = resolveApprovedDecision(
        ledger,
        proposal.approvedDecisionId
      );
      validateWorkItemSources(context, proposal.workItems);
      const subject = decompositionSubject(
        proposal,
        governanceDigest(decision)
      );
      const binding = governanceDigest(subject);
      if (
        entry.executionDecompositions?.some(
          (record) => record.binding === binding
        )
      )
        return;
      (entry.executionDecompositions ??= []).push({ ...subject, binding });
      save();
    });
  } catch {
    // Keep the decomposition output available to the workflow.
  }
}
