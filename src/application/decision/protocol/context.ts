import type { AgentDecision } from "./decision.js";
import type { GoalSpec } from "@/contracts/goal.js";
import type { InspectedFile } from "@/contracts/repository/inspected-file.js";

export type SpecialistContext = {
  goal: GoalSpec;
  // Concrete objective of the approved v4 Assignment, when supplied.
  assignmentObjective?: string;
  repositoryCommitSha: string;
  files: InspectedFile[];
};

export type CollaborativeSpecialistContext = SpecialistContext & {
  assignmentObjective: string;
  approvedDirection: string;
  workItem: {
    id: string;
    objective: string;
    deliverable: string;
  };
  assignmentDeliverable: string;
  predecessorResults: PredecessorDecision[];
  workItemPredecessorResults?: {
    workItemId: string;
    results: PredecessorDecision[];
  }[];
};

type PredecessorDecision = {
  assignmentId: string;
  invocationId: string;
  decision: AgentDecision;
};
