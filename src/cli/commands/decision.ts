import { basename } from "node:path";

import {
  captureRepositorySnapshot,
  loadSnapshotFiles,
  runIndependentDecisions,
  type AgentDecision,
  type RepositorySnapshot,
  type SpecialistDefinition,
} from "@/application/decision/index.js";
import { goalSpecSchema } from "@/contracts/goal.js";

export type DecisionCommandResult = {
  snapshot: RepositorySnapshot;
  decisions: AgentDecision[];
};

export async function runDecisionCommand({ repositoryPath, objective, filePaths }: {
  repositoryPath: string;
  objective: string;
  filePaths: string[];
}): Promise<DecisionCommandResult> {
  if (!repositoryPath?.trim()) throw new Error("Repository path is required.");
  if (!objective?.trim()) throw new Error("Objective is required.");
  if (filePaths.length === 0) throw new Error("At least one decision context file is required.");

  const snapshot = captureRepositorySnapshot(repositoryPath);
  const goal = goalSpecSchema.parse({ objective, targetRepository: basename(snapshot.repositoryRoot) });
  const files = loadSnapshotFiles(snapshot, filePaths);
  const frontendSpecialist: SpecialistDefinition = {
    id: "frontend",
    role: "Frontend Specialist",
    objective: "Evaluate frontend implementation structure, correctness, maintainability, and engineering risks.",
    authority: { repositoryAccess: "read", shellExecution: false },
  };
  const uxSpecialist: SpecialistDefinition = {
    id: "ux",
    role: "UX Specialist",
    objective: "Evaluate interaction quality, usability, accessibility, and user experience risks.",
    authority: { repositoryAccess: "read", shellExecution: false },
  };
  const decisions = await runIndependentDecisions(snapshot, goal, [
    { specialist: frontendSpecialist, files },
    { specialist: uxSpecialist, files },
  ]);
  return { snapshot, decisions };
}
