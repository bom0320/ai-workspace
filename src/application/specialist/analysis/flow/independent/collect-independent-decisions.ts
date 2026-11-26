import type {
  IndependentDecisionInput,
  IndependentDecisionOptions,
} from "../../data-flow/input.js";
import type { GoalSpec } from "@/contracts/goal.js";

import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";
import type { SpecialistContext } from "../../protocol/context.js";
import type { AgentDecision } from "../../protocol/decision.js";
import { analyzeIndependently } from "../../agent/analyze-specialist.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import { validateDecisionEvidence } from "../validation/validate-evidence.js";

export class DecisionValidationError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "DecisionValidationError";
  }
}

export async function collectIndependentDecisions(
  snapshot: RepositorySnapshot,
  goal: GoalSpec,
  inputs: IndependentDecisionInput[],
  options: IndependentDecisionOptions = {}
): Promise<AgentDecision[]> {
  const specialistIds = new Set<string>();
  for (const { specialist } of inputs) {
    if (specialistIds.has(specialist.id)) {
      throw new Error(`Duplicate Specialist ID: ${specialist.id}.`);
    }
    specialistIds.add(specialist.id);
  }

  const validationError = (error: unknown) =>
    options.classifyValidationErrors
      ? new DecisionValidationError(error)
      : error;
  const decisions: AgentDecision[] = [];
  for (const input of inputs) {
    const context: SpecialistContext = {
      goal,
      ...(input.assignmentObjective !== undefined
        ? { assignmentObjective: input.assignmentObjective }
        : {}),
      repositoryCommitSha: snapshot.commitSha,
      files: input.files,
    };
    try {
      assertRepositoryMatchesSnapshot(snapshot);
    } catch (error) {
      throw validationError(error);
    }
    const decision = await analyzeIndependently(
      input.specialist,
      context,
      input.authority,
      options
    );
    try {
      assertRepositoryMatchesSnapshot(snapshot);
      validateDecisionEvidence(context, decision);
    } catch (error) {
      throw validationError(error);
    }
    decisions.push(decision);
  }
  return decisions;
}
