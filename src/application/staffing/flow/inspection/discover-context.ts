import { basename } from "node:path";

import { z } from "zod";

import {
  assertRepositoryMatchesSnapshot,
  captureRepositorySnapshot,
} from "@/services/repository-snapshot/index.js";
import {
  specialistDefinitionSchema,
  type SpecialistDefinition,
} from "@/contracts/specialist.js";
import { goalSpecSchema, type GoalSpec } from "@/contracts/goal.js";
import { listRepositoryFilesAtCommit } from "@/infrastructure/git/index.js";
import { isUnambiguousRepositoryPath } from "@/services/repository-inspection/index.js";

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
import { assertContextBudget, createAllowedFileTree } from "./policy.js";

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
  // Harness-selected exact file allowlist, including metadata if it may be read.
  // File names outside this list are not projected to the CEO either.
  allowedContextPaths: string[];
};

function validateDiscoveryInput(options: DiscoverStaffingContextOptions) {
  const goal = goalSpecSchema.strict().parse(options.goal);
  const limits = staffingInspectionLimitsSchema.parse(options.limits);
  const specialists = z
    .array(specialistDefinitionSchema)
    .parse(options.availableSpecialists);
  if (new Set(specialists.map(({ id }) => id)).size !== specialists.length)
    throw new Error("Duplicate Specialist IDs.");
  const allowedContextPaths = z
    .array(z.string().min(1))
    .parse(options.allowedContextPaths);
  if (allowedContextPaths.some((path) => !isUnambiguousRepositoryPath(path)))
    throw new Error("Invalid Harness context allowlist.");
  return { goal, limits, specialists, allowedContextPaths };
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
    const { goal, limits, specialists, allowedContextPaths } =
      validateDiscoveryInput(options);
    const snapshot = captureRepositorySnapshot(options.repositoryPath);
    assertRepositoryMatchesSnapshot(snapshot);
    const files = listRepositoryFilesAtCommit(
      snapshot.repositoryRoot,
      snapshot.commitSha
    );
    const allowed = new Set(allowedContextPaths);
    const fileTree = createAllowedFileTree(files, allowed, limits);
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
    context = loadRepositoryMetadata(snapshot, files, context);
    const initialState: StaffingContextState = {
      snapshot,
      context,
      files,
      allowedContextPaths: [...allowed],
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
