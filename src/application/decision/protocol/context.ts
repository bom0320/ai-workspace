import type { GoalSpec } from "@/contracts/goal.js";
import type { InspectedFile } from "@/contracts/inspected-file.js";

export type SpecialistContext = {
  goal: GoalSpec;
  repositoryCommitSha: string;
  files: InspectedFile[];
};
