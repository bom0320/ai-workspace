import type { ContextAccessPolicy } from "@/contracts/repository/context-access-policy.js";
import { validateContextAccessPolicy } from "@/services/repository-inspection/index.js";
import { basename } from "node:path";

import {
  assertRepositoryMatchesSnapshot,
  captureRepositorySnapshot,
} from "@/services/repository-snapshot/index.js";
import {
  specialistDefinitionsSchema,
  type SpecialistDefinition,
} from "@/contracts/specialist/definition.js";
import { goalSpecSchema, type GoalSpec } from "@/contracts/goal.js";
import { listRepositoryFilesAtCommit } from "@/infrastructure/git/index.js";

import type { StaffingContextState } from "../../model/state.js";
import { ceoStaffingDecisionSchema } from "../../protocol/ceo.js";
import {
  staffingContextSchema,
  staffingInspectionLimitsSchema,
  type StaffingContext,
  type StaffingInspectionLimits,
} from "../../protocol/context.js";
import { addInspectedFiles, loadRepositoryMetadata } from "./inspect-files.js";
import { seedInitialFiles } from "./initial-seeding.js";
import {
  assertContextBudget,
  createAllowedFileTree,
} from "./context-policy.js";

// Keep Context types available through this module and the public API.
export type { StaffingContextState } from "../../model/state.js";

export type StaffingContextResult =
  | { status: "ready"; state: StaffingContextState }
  | { status: "failed"; reason: string };

export type DiscoverStaffingContextOptions = {
  goal: GoalSpec;
  repositoryPath: string;
  availableSpecialists: SpecialistDefinition[];
  limits: StaffingInspectionLimits;
  // Harness-owned access ceiling; required even when access is explicitly empty.
  contextAccessPolicy: ContextAccessPolicy;
};

function validateDiscoveryInput(options: DiscoverStaffingContextOptions) {
  const goal = goalSpecSchema.strict().parse(options.goal);
  const limits = staffingInspectionLimitsSchema.parse(options.limits);
  const specialists = specialistDefinitionsSchema.parse(
    options.availableSpecialists
  );
  if ("allowedContextPaths" in options)
    throw new Error(
      "Legacy allowedContextPaths is not a current Discovery input."
    );
  const contextAccessPolicy = validateContextAccessPolicy(
    options.contextAccessPolicy
  );
  return { goal, limits, specialists, contextAccessPolicy };
}

function failed(error: unknown): StaffingContextResult {
  return {
    status: "failed",
    reason:
      error instanceof Error
        ? error.message
        : "Staffing context discovery failed.",
  };
}

export function discoverStaffingContext(
  options: DiscoverStaffingContextOptions
): StaffingContextResult {
  try {
    const { goal, limits, specialists, contextAccessPolicy } =
      validateDiscoveryInput(options);
    const snapshot = captureRepositorySnapshot(options.repositoryPath);
    assertRepositoryMatchesSnapshot(snapshot);
    const files = listRepositoryFilesAtCommit(
      snapshot.repositoryRoot,
      snapshot.commitSha
    );
    const fileTree = createAllowedFileTree(files, contextAccessPolicy, limits);
    let context: StaffingContext = {
      goal,
      repository: {
        name: basename(snapshot.repositoryRoot),
        commitSha: snapshot.commitSha,
        fileTree,
        packageScripts: {},
      },
      inspectedFiles: [],
      availableSpecialists: specialists.map(({ id, role, objective }) => ({
        id,
        role,
        objective,
      })),
      limits,
      remainingInspectionBudget: limits.maxTotalFiles,
    };
    assertContextBudget(context);
    context = loadRepositoryMetadata(
      snapshot,
      files,
      context,
      contextAccessPolicy
    );
    const initialState: StaffingContextState = {
      snapshot,
      context,
      files,
      contextAccessPolicy,
    };
    const state = seedInitialFiles(initialState);
    assertRepositoryMatchesSnapshot(snapshot);
    return { status: "ready", state };
  } catch (error) {
    return failed(error);
  }
}

// Pure AI-facing projection; clone so CEO adapters cannot mutate Harness state.
export function createStaffingContext(
  state: StaffingContextState
): StaffingContext {
  return staffingContextSchema.parse(state.context);
}

export function inspectStaffingContext(
  state: StaffingContextState,
  request: unknown
): StaffingContextResult {
  try {
    const decision = ceoStaffingDecisionSchema.parse(request);
    if (decision.type !== "inspect")
      throw new Error("Expected a CEO inspect request.");
    assertRepositoryMatchesSnapshot(state.snapshot);
    const next = addInspectedFiles(state, decision.paths);
    assertRepositoryMatchesSnapshot(state.snapshot);
    return { status: "ready", state: next };
  } catch (error) {
    return failed(error);
  }
}
