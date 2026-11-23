import type { WorkDecompositionResult } from "@/application/work-decomposition/index.js";
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

export function findRegisteredDecomposition(
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

// Internal Phase B writers. A planning-only run may complete without a
// recorded execution source; authorization never falls back to graph output.
export function registerExecutionDecomposition(proposal: Proposal): void {
  try {
    withGovernanceLedger((ledger, save) => {
      const { entry, decision } = resolveApprovedDecision(
        ledger,
        proposal.approvedDecisionId
      );
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
    // Unavailable provenance leaves the output eligible for planning only.
  }
}
