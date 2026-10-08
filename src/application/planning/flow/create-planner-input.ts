import type { PlannerInput, PlanningState } from "../model/context.js";

export function createPlannerInput(state: PlanningState): PlannerInput {
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
