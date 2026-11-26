import type { GoalSpec } from "@/contracts/goal.js";
import type { InspectedFile } from "@/contracts/repository/inspected-file.js";

import type { AssignmentTaskDetailingInput } from "../data-flow/input.js";

type RepositoryInfo = {
  repositoryRoot: string;
  repositoryName: string;
  fileTree: string[];
};

export type PlanningState = {
  goal: GoalSpec;
  detail: { objective: string; deliverable: string; direction: string };
  assignmentDetail: Pick<
    AssignmentTaskDetailingInput,
    "specialist" | "executionBounds"
  > & {
    workItem: AssignmentTaskDetailingInput["context"]["workItem"];
    analysisEvidence?: AssignmentTaskDetailingInput["context"]["analysisEvidence"];
  };
  repository: RepositoryInfo;
  inspectedFiles: InspectedFile[];
};
