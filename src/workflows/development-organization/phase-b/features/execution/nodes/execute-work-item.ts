import {
  executeReadOnlyWorkItem,
  executeWorkItem,
} from "@/application/execution/index.js";
import type { PhaseBState } from "../../../state.js";

export type PhaseBExecutionOptions = {
  workItemId: string;
  readPaths: string[];
  timeoutMs: number;
};

export function createExecuteWorkItemNode(
  repositoryPath: string | undefined,
  options: PhaseBExecutionOptions | undefined
) {
  const execution = options && structuredClone(options);
  return async (state: PhaseBState): Promise<Partial<PhaseBState>> => {
    if (!repositoryPath || !execution) return {};

    const { workItemId, readPaths, timeoutMs } = execution;
    const plan = state.planningResults?.find(
      (entry) => entry.workItemId === workItemId
    );
    const proposal = state.workDecompositionResult;
    const approval = state.handoffResult;
    const workItem =
      proposal?.status === "proposed"
        ? proposal.workItems.find(({ id }) => id === workItemId)
        : undefined;
    if (
      plan?.result.status !== "completed" ||
      !plan.executionSourceId ||
      (workItem?.workType !== "read-only" &&
        !plan.result.task.allowedPaths.length) ||
      plan.executionBlockedReason ||
      approval?.status !== "accepted" ||
      !workItem ||
      workItem.dependsOn.length
    )
      return {
        executionPreparationResult: {
          status: "blocked",
          workItemId,
          reason:
            "The selected Work Item must be ready and have no dependencies.",
        },
      };

    const request = {
      approvedDecisionId: approval.handoff.decision.id,
      executionSourceId: plan.executionSourceId,
      workItem,
      task: plan.result.task,
      repositoryPath,
      readPaths,
      timeoutMs,
    };
    if (workItem.workType === "read-only") {
      const outcome = await executeReadOnlyWorkItem(request);
      return outcome.status === "executed"
        ? {
            readOnlyExecutionResult: {
              workItemId: outcome.workItemId,
              result: outcome.result,
            },
          }
        : {
            executionPreparationResult: {
              status: outcome.status,
              workItemId,
              reason: outcome.reason,
            },
          };
    }

    const outcome = await executeWorkItem(request);
    return outcome.status === "executed"
      ? {
          workerExecutionResult: {
            workItemId: outcome.workItemId,
            result: outcome.result,
          },
        }
      : {
          executionPreparationResult: {
            status: outcome.status,
            workItemId,
            reason: outcome.reason,
          },
        };
  };
}
