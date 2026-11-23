import type {
  WorkDecompositionResult,
  WorkItem,
} from "@/application/work-decomposition/index.js";
import { taskContractSchema, type TaskContract } from "@/contracts/task.js";
import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import { resolveApprovedDecision } from "../../../../approval/features/direction-review/flow/approved-decision.js";
import {
  resolveGovernanceRepository,
  withGovernanceLedger,
} from "../../../../records/governance-transaction.js";
import type { RepositoryGovernance } from "../../../../model/ledger.js";
import { resolveExecutionHandoff } from "../../../../approval/features/execution-delegation/flow/verify-execution-handoff.js";
import { validateTaskExecutionContract } from "./validation/validate-task-execution-contract.js";

type Proposal = Extract<WorkDecompositionResult, { status: "proposed" }>;

function decompositionSubject(proposal: Proposal, approvalBinding: string) {
  return {
    approvedDecisionId: proposal.approvedDecisionId,
    approvalBinding,
    workItems: proposal.workItems,
  };
}

function matchWorkItem(
  entry: RepositoryGovernance,
  proposal: Proposal,
  workItem: WorkItem,
  approvalBinding: string
) {
  const binding = governanceDigest(
    decompositionSubject(proposal, approvalBinding)
  );
  const decomposition = entry.executionDecompositions?.find(
    (record) => record.binding === binding
  );
  const item = decomposition?.workItems.find(({ id }) => id === workItem.id);
  if (item && governanceDigest(item) === governanceDigest(workItem))
    return { binding, item };
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
      const approvalBinding = governanceDigest(decision);
      const match = matchWorkItem(entry, proposal, workItem, approvalBinding);
      if (!match || match.item.workType === "read-only") return;
      const { binding, item } = match;
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
              governanceDigest(approved) !== approvalBinding ||
              !latest.executionDecompositions?.some(
                (record) => record.binding === binding
              ) ||
              resolveGovernanceRepository(repositoryPath) !== root
            )
              return;
            assertRepositoryMatchesSnapshot(snapshot);
            return saveExecutionSource(
              latest,
              save,
              binding,
              item.id,
              task,
              snapshot
            );
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

function saveExecutionSource(
  entry: RepositoryGovernance,
  save: () => void,
  decompositionBinding: string,
  workItemId: string,
  task: TaskContract,
  snapshot: RepositorySnapshot
) {
  const subject = {
    decompositionBinding,
    workItemId,
    taskDigest: governanceDigest(task),
    snapshot,
  };
  const id = governanceDigest(subject);
  if (!entry.workItemExecutionSources?.some((record) => record.id === id)) {
    (entry.workItemExecutionSources ??= []).push({ ...subject, id });
    save();
  }
  return id;
}

// Internal Phase B writer. The handoff identifies the expected approval only.
type ExecutionSourceRegistration =
  { executionSourceId: string } | { executionBlockedReason: string };

export function beginValidatedWorkItemExecutionSource(
  handoff: Parameters<typeof resolveExecutionHandoff>[1],
  proposal: Proposal,
  workItem: WorkItem,
  repositoryPath: string
): (task: TaskContract) => ExecutionSourceRegistration {
  function validateAndRecord(submission?: {
    task: TaskContract;
  }): ExecutionSourceRegistration | undefined {
    let reason = "Current joint execution approval could not be verified.";
    try {
      return withGovernanceLedger((ledger, save) => {
        const { entry, decision, context, snapshot, delegation, policy } =
          resolveExecutionHandoff(ledger, handoff);
        reason = "Stored Work Item provenance could not be verified.";
        const match = matchWorkItem(
          entry,
          proposal,
          workItem,
          governanceDigest(decision)
        );
        if (proposal.approvedDecisionId !== decision.id || !match)
          return { executionBlockedReason: reason };

        reason = "Repository does not match the approved Snapshot.";
        if (
          resolveGovernanceRepository(repositoryPath) !==
          snapshot.repositoryRoot
        )
          return { executionBlockedReason: reason };
        assertRepositoryMatchesSnapshot(snapshot);
        if (!submission) return;

        reason =
          "TaskContract is incompatible with the approved execution bounds.";
        const task = taskContractSchema.strict().parse(submission.task);
        if (
          task.targetRepository !== context.goal.targetRepository ||
          !(context.goal.constraints ?? []).every((constraint) =>
            task.constraints.includes(constraint)
          )
        )
          return { executionBlockedReason: reason };
        validateTaskExecutionContract(
          task,
          delegation.grant,
          match.item.workType
        );
        validateTaskExecutionContract(task, policy, match.item.workType);
        if (Date.now() >= Date.parse(delegation.grant.expiresAt))
          return {
            executionBlockedReason:
              "Execution Delegation expired before registration.",
          };

        reason = "Execution Source could not be persisted.";
        return {
          executionSourceId: saveExecutionSource(
            entry,
            save,
            match.binding,
            match.item.id,
            task,
            snapshot
          ),
        };
      });
    } catch {
      return { executionBlockedReason: reason };
    }
  }

  // Check provenance before Planning reads the Repository. Recheck against
  // the latest Ledger and save within one transaction after Planning.
  const blocked = validateAndRecord();
  return (task) =>
    blocked ??
    validateAndRecord({ task }) ?? {
      executionBlockedReason: "Execution Source could not be verified.",
    };
}
