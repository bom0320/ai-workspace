import type { GoalSpec } from "@/contracts/goal.js";
import type { InspectedFile } from "@/contracts/repository/inspected-file.js";

export type SpecialistContext = {
  goal: GoalSpec;
  repositoryCommitSha: string;
  files: InspectedFile[];
};
