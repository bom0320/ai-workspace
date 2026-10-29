import { basename } from "node:path";

import { goalSpecSchema, type GoalSpec } from "@/contracts/goal.js";

import type { AgentDecision } from "../protocol/decision.js";
import type { RepositorySnapshot } from "@/contracts/repository-snapshot.js";
import type { SpecialistDefinition } from "@/contracts/specialist.js";
import { captureRepositorySnapshot } from "@/services/repository-snapshot/index.js";
import { loadSnapshotFiles } from "./context/load-snapshot-files.js";
import { runIndependentDecisions } from "./orchestration/run-independent-decisions.js";

export type RunDecisionInput = {
  repositoryPath: string;
  objective: string;
  filePaths: string[];
};

export type RunDecisionResult = {
  goal: GoalSpec;
  snapshot: RepositorySnapshot;
  decisions: AgentDecision[];
};

export async function runDecision({
  repositoryPath,
  objective,
  filePaths,
}: RunDecisionInput): Promise<RunDecisionResult> {
  if (!repositoryPath?.trim()) throw new Error("Repository path is required.");
  if (!objective?.trim()) throw new Error("Objective is required.");
  if (filePaths.length === 0)
    throw new Error("At least one decision context file is required.");

  const snapshot = captureRepositorySnapshot(repositoryPath);
  const goal = goalSpecSchema.parse({
    objective,
    targetRepository: basename(snapshot.repositoryRoot),
  });
  const files = loadSnapshotFiles(snapshot, filePaths);
  const frontendSpecialist: SpecialistDefinition = {
    id: "frontend",
    role: "Frontend Specialist",
    objective:
      "Evaluate frontend implementation structure, correctness, maintainability, and engineering risks.",
    authority: { repositoryAccess: "read", shellExecution: false },
  };
  const uxSpecialist: SpecialistDefinition = {
    id: "ux",
    role: "UX Specialist",
    objective:
      "Evaluate interaction quality, usability, accessibility, and user experience risks.",
    authority: { repositoryAccess: "read", shellExecution: false },
  };
  const decisions = await runIndependentDecisions(snapshot, goal, [
    { specialist: frontendSpecialist, files },
    { specialist: uxSpecialist, files },
  ]);
  return { goal, snapshot, decisions };
}
