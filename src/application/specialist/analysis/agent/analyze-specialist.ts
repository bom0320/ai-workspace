import type {
  CodexSpecialistOptions,
  SpecialistReadInput,
  CollaborativeSpecialistReadInput,
} from "../data-flow/input.js";
import { invokeCodexSpecialist } from "./invoke-codex-specialist.js";
import type { AgentDecision } from "../protocol/decision.js";

export async function analyzeIndependently(
  specialist: SpecialistReadInput["specialist"],
  context: SpecialistReadInput["context"],
  authority: SpecialistReadInput["authority"],
  options: CodexSpecialistOptions = {}
): Promise<AgentDecision> {
  return invokeCodexSpecialist(
    { mode: "independent", specialist, context, authority },
    options
  );
}

export function analyzeAssignment(
  specialist: CollaborativeSpecialistReadInput["specialist"],
  context: CollaborativeSpecialistReadInput["context"],
  authority: CollaborativeSpecialistReadInput["authority"],
  options: CodexSpecialistOptions = {}
) {
  return invokeCodexSpecialist(
    { mode: "assignment", specialist, context, authority },
    options
  );
}
