import type { PlanningLimits } from "../../model/limits.js";
import type { PlannerContext } from "../../protocol/planner.js";
import type { PlanningState } from "../../model/state.js";

export function createPlannerContext(
  state: PlanningState,
  limits: PlanningLimits
): PlannerContext {
  return {
    goal: state.goal,
    repository: {
      name: state.repository.repositoryName,
      fileTree: state.repository.fileTree,
      packageScripts: state.repository.packageScripts,
      instructions: state.repository.instructions,
    },
    inspectedFiles: state.inspectedFiles,
    limits,
    remainingInspectionBudget: Math.max(
      0,
      limits.maxTotalFiles - state.inspectedFiles.length
    ),
  };
}
