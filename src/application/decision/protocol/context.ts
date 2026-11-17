import type { GoalSpec } from "@/contracts/goal.js";
import type { InspectedFile } from "@/contracts/repository/inspected-file.js";

export type SpecialistContext = {
  goal: GoalSpec;
  // Concrete objective of the approved v4 Assignment, when supplied.
  assignmentObjective?: string;
  repositoryCommitSha: string;
  files: InspectedFile[];
};
