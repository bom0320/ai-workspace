import type { RunDecisionInput } from "../data-flow/input.js";
import type { RunDecisionResult } from "../data-flow/output.js";
import type { SpecialistAuthority } from "@/contracts/specialist/authority.js";
import { basename } from "node:path";

import { goalSpecSchema } from "@/contracts/goal.js";

import type { SpecialistDefinition } from "@/contracts/specialist/definition.js";
import {
  captureRepositorySnapshot,
  loadSnapshotFiles,
} from "@/services/repository-snapshot/index.js";
import { collectIndependentDecisions } from "./independent/collect-independent-decisions.js";

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
  };
  const uxSpecialist: SpecialistDefinition = {
    id: "ux",
    role: "UX Specialist",
    objective:
      "Evaluate interaction quality, usability, accessibility, and user experience risks.",
  };
  const authority: SpecialistAuthority = {
    repositoryAccess: "read",
    shellExecution: false,
  };
  const decisions = await collectIndependentDecisions(snapshot, goal, [
    { specialist: frontendSpecialist, authority, files },
    { specialist: uxSpecialist, authority, files },
  ]);
  return { goal, snapshot, decisions };
}
