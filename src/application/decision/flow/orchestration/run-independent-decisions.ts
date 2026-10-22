import type { GoalSpec } from "@/contracts/goal.js";
import type { InspectedFile } from "@/contracts/inspected-file.js";

import type { RepositorySnapshot } from "../../model/snapshot.js";
import type { SpecialistDefinition } from "../../model/specialist.js";
import type { SpecialistContext } from "../../protocol/context.js";
import type { AgentDecision } from "../../protocol/decision.js";
import {
  runCodexSpecialist,
  type CodexSpecialistOptions,
} from "../../specialist/codex-specialist.js";
import { assertRepositoryMatchesSnapshot } from "../context/repository-snapshot.js";
import { validateDecisionEvidence } from "../validation/validate-evidence.js";

export type IndependentDecisionInput = {
  specialist: SpecialistDefinition;
  files: InspectedFile[];
};

export async function runIndependentDecisions(
  snapshot: RepositorySnapshot,
  goal: GoalSpec,
  inputs: IndependentDecisionInput[],
  options: CodexSpecialistOptions = {}
): Promise<AgentDecision[]> {
  const specialistIds = new Set<string>();
  for (const { specialist } of inputs) {
    if (specialistIds.has(specialist.id)) {
      throw new Error(`Duplicate Specialist ID: ${specialist.id}.`);
    }
    specialistIds.add(specialist.id);
  }

  const decisions: AgentDecision[] = [];
  for (const input of inputs) {
    const context: SpecialistContext = {
      goal,
      repositoryCommitSha: snapshot.commitSha,
      files: input.files,
    };
    assertRepositoryMatchesSnapshot(snapshot);
    const decision = await runCodexSpecialist(
      input.specialist,
      context,
      options
    );
    assertRepositoryMatchesSnapshot(snapshot);
    validateDecisionEvidence(context, decision);
    decisions.push(decision);
  }
  return decisions;
}
