import type {
  WorkDecompositionResult,
  WorkItem,
} from "@/application/work-decomposition/index.js";
import type { TaskContract } from "@/contracts/task.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import { resolveApprovedDecision } from "../../../../approval/features/direction-review/flow/approved-decision.js";
import {
  resolveGovernanceRepository,
  withGovernanceLedger,
} from "../../../../records/governance-transaction.js";
import { taskContractSchema } from "@/contracts/task.js";

type Proposal = Extract<WorkDecompositionResult, { status: "proposed" }>;

function decompositionSubject(proposal: Proposal, approvalBinding: string) {
  return {
    approvedDecisionId: proposal.approvedDecisionId,
    approvalBinding,
    workItems: proposal.workItems,
  };
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
      if (
        !entry.executionDelegations?.some(
          ({ approvedDecisionId }) => approvedDecisionId === decision.id
        )
      )
        return;
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

export function beginWorkItemExecutionSource(
  proposal: Proposal,
  workItem: WorkItem,
  repositoryPath: string
): ((task: TaskContract) => string | undefined) | undefined {
  try {
    return withGovernanceLedger((ledger) => {
      const { entry, decision, snapshot } = resolveApprovedDecision(
        ledger,
        proposal.approvedDecisionId
      );
      const binding = governanceDigest(
        decompositionSubject(proposal, governanceDigest(decision))
      );
      const decomposition = entry.executionDecompositions?.find(
        (record) => record.binding === binding
      );
      const item = decomposition?.workItems.find(
        ({ id }) => id === workItem.id
      );
      if (!item || governanceDigest(item) !== governanceDigest(workItem))
        return;
      const root = resolveGovernanceRepository(repositoryPath);
      if (root !== snapshot.repositoryRoot) return;
      assertRepositoryMatchesSnapshot(snapshot);

      return (value) => {
        try {
          const task = taskContractSchema.strict().parse(value);
          return withGovernanceLedger((current, save) => {
            const { entry: latest, decision: approved } =
              resolveApprovedDecision(current, proposal.approvedDecisionId);
            if (
              governanceDigest(approved) !== decomposition?.approvalBinding ||
              !latest.executionDecompositions?.some(
                (record) => record.binding === binding
              ) ||
              resolveGovernanceRepository(repositoryPath) !== root
            )
              return;
            assertRepositoryMatchesSnapshot(snapshot);
            const subject = {
              decompositionBinding: binding,
              workItemId: item.id,
              taskDigest: governanceDigest(task),
              snapshot,
            };
            const id = governanceDigest(subject);
            if (
              !latest.workItemExecutionSources?.some(
                (record) => record.id === id
              )
            ) {
              (latest.workItemExecutionSources ??= []).push({ ...subject, id });
              save();
            }
            return id;
          });
        } catch {
          return undefined;
        }
      };
    });
  } catch {
    return undefined;
  }
}
