import { createExecuteAssignmentsNode } from "./features/execution/nodes/execute-assignments.js";
import type { CollaborativeExecutionOptions } from "./features/execution/execution/execute-assignment-plan.js";
import { END, START, StateGraph } from "@langchain/langgraph";
import type { RunWorkDecompositionOptions } from "@/application/work-decomposition/index.js";
import type { AssignmentPlanAgent } from "@/application/planning/index.js";
import { createPrepareAssignmentsNode } from "./features/planning/nodes/prepare-assignments.js";
import { createInitializePlanningNode } from "./features/planning/nodes/initialize-planning.js";
import { createPlanWorkItemNode } from "./features/planning/nodes/plan-work-item.js";
import {
  createSelectWorkItemsNode,
  type SelectWorkItemIds,
} from "./features/planning/nodes/select-work-items.js";
import type { executeWorkItemPlanning } from "./features/planning/execution/execute-work-item-planning.js";
import { createRunWorkDecompositionNode } from "./features/work-decomposition/nodes/run-work-decomposition.js";
import { phaseBInput, phaseBState } from "./state.js";

import {
  createExecuteWorkItemNode,
  type PhaseBExecutionOptions,
} from "./features/execution/nodes/execute-work-item.js";

type DetailedPlanningOptions = Omit<
  Parameters<typeof executeWorkItemPlanning>[0],
  "phaseB" | "executionCeiling"
>;

export type PhaseBGraphOptions = Omit<
  RunWorkDecompositionOptions,
  "executionCeiling"
> & {
  planning?: {
    selectWorkItemIds: SelectWorkItemIds;
    assignment?: {
      agent: AssignmentPlanAgent;
      execution?: CollaborativeExecutionOptions;
    };
    detailed?: DetailedPlanningOptions;
    execution?: PhaseBExecutionOptions;
  };
};

export function createPhaseBGraph({
  planning,
  ...decompositionOptions
}: PhaseBGraphOptions = {}) {
  const { assignment, detailed, execution, selectWorkItemIds } = planning ?? {};

  // 1. Register Workflow Nodes
  const graph = new StateGraph({ state: phaseBState, input: phaseBInput })
    .addNode(
      "run-work-decomposition",
      createRunWorkDecompositionNode(decompositionOptions)
    )
    .addNode("select-work-items", createSelectWorkItemsNode(selectWorkItemIds))
    .addNode(
      "initialize-planning",
      createInitializePlanningNode(!assignment && !!detailed)
    )
    .addNode(
      "prepare-assignments",
      createPrepareAssignmentsNode(
        assignment?.agent,
        !!detailed,
        execution?.workItemId
      )
    )
    .addNode(
      "plan-work-item",
      createPlanWorkItemNode(
        detailed,
        assignment ? "draft" : "execution-source"
      )
    )
    .addNode(
      "execute-assignments",
      createExecuteAssignmentsNode(assignment?.execution)
    )
    .addNode(
      "execute-work-item",
      createExecuteWorkItemNode(detailed?.repositoryPath, execution)
    );

  // 2. Connect Execution Edges
  graph.addEdge(START, "run-work-decomposition");
  graph.addConditionalEdges(
    "run-work-decomposition",
    (state) =>
      (assignment || detailed) &&
      selectWorkItemIds &&
      state.handoffResult?.status === "accepted" &&
      state.workDecompositionResult?.status === "proposed"
        ? "select-work-items"
        : END,
    ["select-work-items", END]
  );
  graph.addEdge("select-work-items", "initialize-planning");
  graph.addConditionalEdges(
    "initialize-planning",
    (state) => {
      if (!state.selectedWorkItemIds?.length) return END;
      if (assignment) return "prepare-assignments";
      return detailed ? "plan-work-item" : END;
    },
    ["prepare-assignments", "plan-work-item", END]
  );
  graph.addConditionalEdges(
    "plan-work-item",
    (state) => {
      const latest = state.planningResults?.at(-1);
      if (
        !latest ||
        (latest.result.status !== "completed" &&
          latest.result.status !== "read-only") ||
        (!assignment && !latest.executionSourceId) ||
        latest.executionBlockedReason
      )
        return END;
      if (state.pendingPlanningIds?.length) return "plan-work-item";
      if (assignment?.execution) return "execute-assignments";
      return execution && !assignment ? "execute-work-item" : END;
    },
    ["plan-work-item", "execute-work-item", "execute-assignments", END]
  );
  graph.addConditionalEdges(
    "prepare-assignments",
    (state) => {
      if (state.assignmentPlanResult?.status !== "prepared") return END;
      if (detailed && state.pendingPlanningIds?.length) return "plan-work-item";
      return assignment?.execution ? "execute-assignments" : END;
    },
    ["plan-work-item", "execute-assignments", END]
  );
  graph.addEdge("execute-assignments", END);
  graph.addEdge("execute-work-item", END);

  // 3. Compile Graph
  return graph
    .compile()
    .withConfig({ recursionLimit: Number.MAX_SAFE_INTEGER });
}
