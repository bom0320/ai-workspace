import {
  runDecision,
  type RunDecisionInput,
  type RepositorySnapshot,
  type AgentDecision,
} from "@/application/decision/index.js";
import type { GoalSpec } from "@/contracts/goal.js";

import type { CodexComparatorOptions } from "../comparator/codex-comparator.js";
import type { ComparisonResult } from "../model/comparison.js";
import { compareDecisions } from "./compare-decisions.js";

export type RunDecisionComparisonResult = {
  goal: GoalSpec;
  snapshot: RepositorySnapshot;
  decisions: AgentDecision[];
  comparison: ComparisonResult;
};

export async function runDecisionComparison(
  input: RunDecisionInput,
  options: CodexComparatorOptions = {},
): Promise<RunDecisionComparisonResult> {
  const decisionResult = await runDecision(input);
  const comparison = await compareDecisions({
    goal: decisionResult.goal,
    repositoryCommitSha: decisionResult.snapshot.commitSha,
    decisions: decisionResult.decisions,
  }, options);
  return { ...decisionResult, comparison };
}
