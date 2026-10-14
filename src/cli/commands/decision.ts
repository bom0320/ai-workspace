import {
  runDecision,
  type RunDecisionInput,
  type RunDecisionResult,
} from "@/application/decision/index.js";

export type DecisionCommandResult = RunDecisionResult;

export async function runDecisionCommand(input: RunDecisionInput): Promise<DecisionCommandResult> {
  return runDecision(input);
}
