import { END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import type { RunWorkDecompositionOptions } from "@/application/management/work-decomposition/index.js";
import type { AssignmentPlanAgent } from "@/application/management/allocation/execution-assignment/index.js";
import type { AssignmentExecutionOptions } from "./features/execution/coordination/coordinate-assignment-executions.js";
import { createAssignSpecialistsNode } from "./features/planning/nodes/assign-specialists.js";
import { createExecuteAssignmentsNode } from "./features/execution/nodes/execute-assignments.js";
import {
  createSelectWorkItemsNode,
  type SelectWorkItemIds,
} from "./features/planning/nodes/select-work-items.js";
import { createRunWorkDecompositionNode } from "./features/work-decomposition/nodes/run-work-decomposition.js";
import { integrateAssignments } from "./features/integration/nodes/integrate-assignments.js";
import { phaseBInput, phaseBState } from "./state.js";

const phaseBGraphOptionsSchema = z.strictObject({
  workDecomposition: z
    .strictObject({
      agent: z
        .custom<NonNullable<RunWorkDecompositionOptions["agent"]>>(
          (value) => typeof value === "function"
        )
        .optional(),
      timeoutMs: z.number().optional(),
    })
    .optional(),
  selectWorkItemIds: z
    .custom<SelectWorkItemIds>((value) => typeof value === "function")
    .optional(),
  assignmentIntegration: z.boolean().optional(),
  assignmentPlanning: z
    .custom<AssignmentPlanAgent>((value) => typeof value === "function")
    .optional(),
  assignmentExecution: z
    .strictObject({
      contexts: z.custom<AssignmentExecutionOptions["contexts"]>(
        (value) =>
          typeof value === "object" && value !== null && !Array.isArray(value)
      ),
      maxConcurrentRuns: z.number().optional(),
    })
    .optional(),
});

export type PhaseBGraphOptions = z.infer<typeof phaseBGraphOptionsSchema>;

export function createPhaseBGraph(options: PhaseBGraphOptions = {}) {
  const parsed = phaseBGraphOptionsSchema.safeParse(options);
  if (!parsed.success)
    throw new Error(
      "Unsupported Phase B Graph options. Use Work Decomposition, Work Item selection, and Assignment Planning or Execution options."
    );
  const {
    workDecomposition = {},
    selectWorkItemIds,
    assignmentPlanning,
    assignmentExecution,
    assignmentIntegration,
  } = parsed.data;

  if (assignmentPlanning && !selectWorkItemIds)
    throw new Error("Assignment Planning requires Work Item selection.");
  if (assignmentExecution && !assignmentPlanning)
    throw new Error("Assignment Execution requires Assignment Planning.");

  if (assignmentIntegration && !assignmentExecution)
    throw new Error("Assignment Integration requires Assignment Execution.");

  return new StateGraph({ state: phaseBState, input: phaseBInput })
    .addNode(
      "run-work-decomposition",
      createRunWorkDecompositionNode(workDecomposition)
    )
    .addNode("select-work-items", createSelectWorkItemsNode(selectWorkItemIds))
    .addNode(
      "assign-specialists",
      createAssignSpecialistsNode(assignmentPlanning)
    )
    .addNode(
      "execute-assignments",
      createExecuteAssignmentsNode(assignmentExecution)
    )
    .addNode("integrate-assignments", integrateAssignments)
    .addEdge(START, "run-work-decomposition")
    .addConditionalEdges(
      "run-work-decomposition",
      (state) =>
        selectWorkItemIds &&
        state.handoffResult?.status === "accepted" &&
        state.workDecompositionResult?.status === "proposed"
          ? "select-work-items"
          : END,
      ["select-work-items", END]
    )
    .addConditionalEdges(
      "select-work-items",
      (state) =>
        assignmentPlanning && state.selectedWorkItemIds?.length
          ? "assign-specialists"
          : END,
      ["assign-specialists", END]
    )
    .addConditionalEdges(
      "assign-specialists",
      (state) =>
        assignmentExecution && state.assignmentPlanResult?.status === "prepared"
          ? "execute-assignments"
          : END,
      ["execute-assignments", END]
    )
    .addConditionalEdges(
      "execute-assignments",
      (state) => {
        const result = state.assignmentExecutionResult;
        return assignmentIntegration &&
          result &&
          "workItemExecutionStatuses" in result &&
          result.workItemExecutionStatuses.some(
            ({ status }) => status === "execution-completed"
          )
          ? "integrate-assignments"
          : END;
      },
      ["integrate-assignments", END]
    )
    .addEdge("integrate-assignments", END)
    .compile()
    .withConfig({ recursionLimit: Number.MAX_SAFE_INTEGER });
}
