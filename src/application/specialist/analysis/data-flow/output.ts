import type { GoalSpec } from "@/contracts/goal.js";
import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";
import type { AgentDecision } from "../protocol/decision.js";

export type RunDecisionResult = {
  goal: GoalSpec;
  snapshot: RepositorySnapshot;
  decisions: AgentDecision[];
};
