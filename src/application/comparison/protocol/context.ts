import type { AgentDecision } from "@/application/decision/index.js";
import type { GoalSpec } from "@/contracts/goal.js";

export type ComparisonContext = {
  goal: GoalSpec;
  repositoryCommitSha: string;
  decisions: AgentDecision[];
};
