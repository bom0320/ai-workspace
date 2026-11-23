import { prepareGovernedExecution } from "@/application/execution/index.js";
import type { PhaseBState } from "../../../state.js";

export type PhaseBExecutionOptions = {
  readPaths: string[];
  timeoutMs: number;
};

export function createPrepareExecutionNode(
  repositoryPath: string | undefined,
  options: PhaseBExecutionOptions | undefined
) {
  const execution = options && structuredClone(options);
  return (state: PhaseBState): Partial<PhaseBState> => {
    if (!repositoryPath || !execution) return {};

    const [plan] = state.planningResults ?? [];
    const proposal = state.workDecompositionResult;
    const approval = state.handoffResult;
    const workItem =
      proposal?.status === "proposed"
        ? proposal.workItems.find(({ id }) => id === plan?.workItemId)
        : undefined;
    if (
      state.planningResults?.length !== 1 ||
      plan?.result.status !== "completed" ||
      !plan.executionSourceId ||
      plan.executionBlockedReason ||
      approval?.status !== "accepted" ||
      !workItem ||
      workItem.dependsOn.length
    )
      return {
        executionResult: {
          status: "blocked",
          reason:
            "Execution requires one ready Work Item without dependencies.",
        },
      };

    return {
      executionResult: prepareGovernedExecution({
        approvedDecisionId: approval.handoff.decision.id,
        executionSourceId: plan.executionSourceId,
        workItem,
        task: plan.result.task,
        repositoryPath,
        readPaths: execution.readPaths,
        timeoutMs: execution.timeoutMs,
      }),
    };
  };
}
