import { randomUUID } from "node:crypto";
import type { AssignmentTaskDetailingInput } from "../data-flow/input.js";
import type { PlanningResult } from "../data-flow/output.js";
import { createCodexPlanner } from "../planner/codex-planner.js";
import { runPlanningLoop } from "./planning-loop/planning-loop.js";

export function detailAssignmentTask({
  specialist,
  workItem,
  assignment,
  context,
  executionBounds,
  repositoryRoot,
  deadlineMs,
  limits,
  assertEligible,
  inspect,
}: AssignmentTaskDetailingInput): Promise<PlanningResult> {
  return runPlanningLoop({
    initialState: {
      goal: context.goal,
      detail: {
        objective: assignment.objective,
        deliverable: assignment.deliverable,
        direction: context.approvedDirection,
      },
      assignmentDetail: {
        specialist,
        workItem: {
          id: workItem.id,
          objective: workItem.objective,
          deliverable: workItem.deliverable,
        },
        executionBounds,
        analysisEvidence: context.analysisEvidence,
      },
      inspectedFiles: context.files,
      repository: {
        repositoryRoot,
        repositoryName: context.goal.targetRepository,
        fileTree: context.repositoryFiles?.map(({ path }) => path) ?? [],
      },
    },
    limits,
    goalId: `goal-${randomUUID()}`,
    taskId: `task-${randomUUID()}`,
    planner(state, limits) {
      assertEligible();
      const timeoutMs = deadlineMs - Date.now();
      if (timeoutMs < 1) throw new Error("Assignment Read Session expired.");
      return createCodexPlanner({ timeoutMs })(state, limits);
    },
    inspect(state, paths) {
      const expanded = inspect(paths);
      return {
        ...state,
        inspectedFiles: expanded.files,
        assignmentDetail: {
          ...state.assignmentDetail,
          analysisEvidence: expanded.analysisEvidence,
        },
      };
    },
  });
}
