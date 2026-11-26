import type { AgentDecision } from "@/application/specialist/analysis/index.js";
import type { GoalSpec } from "@/contracts/goal.js";

export type ComparisonContext = {
  goal: GoalSpec;
  repositoryCommitSha: string;
  decisions: AgentDecision[];
};

export type CodexComparatorOptions = {
  timeoutMs?: number;
};
