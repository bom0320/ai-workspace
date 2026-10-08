import type { PlannerContext } from "../protocol/planner.js";
import type { PlanningState } from "../model/state.js";

export function createPlannerContext(state: PlanningState): PlannerContext {
  return {
    goal: state.goal,
    repository: {
      name: state.repository.repositoryName,
      fileTree: state.repository.fileTree,
      packageScripts: state.repository.packageScripts,
      instructions: state.repository.instructions,
    },
    inspectedFiles: state.inspectedFiles,
  };
}
