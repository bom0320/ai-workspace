import {
  runDecision,
  type RunDecisionInput,
  type RunDecisionResult,
} from "@/application/decision/index.js";
import { compareDecisions, type ComparisonResult } from "@/application/comparison/index.js";

export type DecisionCommandResult = RunDecisionResult & {
  comparison: ComparisonResult;
};

export async function runDecisionCommand(input: RunDecisionInput): Promise<DecisionCommandResult> {
  const decisionResult = await runDecision(input);
  const comparison = await compareDecisions({
    goal: decisionResult.goal,
    repositoryCommitSha: decisionResult.snapshot.commitSha,
    decisions: decisionResult.decisions,
  });
  return { ...decisionResult, comparison };
}
