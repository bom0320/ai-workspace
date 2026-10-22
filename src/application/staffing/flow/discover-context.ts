import { basename } from "node:path";

import { z } from "zod";

import {
  assertRepositoryMatchesSnapshot,
  captureRepositorySnapshot,
  specialistDefinitionSchema,
  type RepositorySnapshot,
  type SpecialistDefinition,
} from "@/application/decision/index.js";
import { goalSpecSchema, type GoalSpec } from "@/contracts/goal.js";
import {
  listRepositoryFilesAtCommit,
  readRepositoryFileAtCommit,
  type CommitFile,
} from "@/infrastructure/git/index.js";
import {
  isInternalInspectionComponent,
  isUnambiguousRepositoryPath,
  parsePackageScripts,
  selectGoalMentionedPaths,
} from "@/services/repository-inspection/index.js";

import { ceoStaffingDecisionSchema } from "../protocol/ceo.js";
import {
  staffingContextSchema,
  staffingInspectionLimitsSchema,
  type StaffingContext,
  type StaffingInspectionLimits,
} from "../protocol/context.js";

// Harness-owned in-memory state. Never accept this state or its access policy
// from a CEO response. It is not durable state, approval, or an authority token.
export type StaffingContextState = {
  snapshot: RepositorySnapshot;
  context: StaffingContext;
  allowedContextPaths: string[];
  files: CommitFile[];
};

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

function isInspectablePath(path: string): boolean {
  return (
    isUnambiguousRepositoryPath(path) &&
    !path
      .split("/")
      .some(
        (part) =>
          isInternalInspectionComponent(part.toLowerCase()) ||
          [".aws", ".ssh", ".codex", ".agents"].includes(part.toLowerCase()) ||
          /^\.env(?:\.|$)/i.test(part) ||
          /\.(?:pem|key|p12|pfx)$/i.test(part)
      )
  );
}

function byteLength(context: StaffingContext): number {
  return Buffer.byteLength(JSON.stringify(context), "utf8");
}

function assertContextBudget(context: StaffingContext): void {
  if (byteLength(context) > context.limits.maxContextBytes)
    throw new Error("Staffing context exceeds maxContextBytes.");
}

function requireFile(
  files: CommitFile[],
  path: string,
  limits: StaffingInspectionLimits
): CommitFile {
  const file = files.find((entry) => entry.path === path);
  if (
    !file ||
    !["100644", "100755"].includes(file.mode) ||
    file.size === null
  ) {
    throw new Error(
      `Inspection target is not a regular Snapshot file: ${path}`
    );
  }
  if (file.size > limits.maxFileBytes)
    throw new Error(`Inspection file exceeds maxFileBytes: ${path}`);
  return file;
}

// All request paths and sizes are checked before any blob in the batch is read.
function addInspectedFiles(
  state: StaffingContextState,
  paths: string[]
): StaffingContextState {
  const { context } = state;
  const { limits } = context;
  if (paths.length > limits.maxFilesPerRequest)
    throw new Error("Inspection exceeds maxFilesPerRequest.");
  if (new Set(paths).size !== paths.length)
    throw new Error("Duplicate inspection paths.");
  for (const path of paths) {
    if (!isInspectablePath(path) || !state.allowedContextPaths.includes(path)) {
      throw new Error(`Inspection path is forbidden or ambiguous: ${path}`);
    }
    requireFile(state.files, path, limits);
  }
  const inspected = new Set(context.inspectedFiles.map((file) => file.path));
  const fresh = paths.filter((path) => !inspected.has(path));
  if (fresh.length === 0)
    throw new Error("No new inspection context requested.");
  if (inspected.size + fresh.length > limits.maxTotalFiles)
    throw new Error("Inspection exceeds maxTotalFiles.");
  const bytes = fresh.reduce(
    (sum, path) => sum + requireFile(state.files, path, limits).size!,
    0
  );
  if (byteLength(context) + bytes > limits.maxContextBytes)
    throw new Error("Inspection exceeds maxContextBytes.");
  const files = fresh.map((path) => ({
    path,
    content: readRepositoryFileAtCommit(
      state.snapshot.repositoryRoot,
      state.snapshot.commitSha,
      path
    ),
  }));
  const next: StaffingContext = {
    ...context,
    inspectedFiles: [...context.inspectedFiles, ...files],
    remainingInspectionBudget:
      limits.maxTotalFiles - inspected.size - fresh.length,
  };
  // JSON escaping and field overhead also count toward the actual Context size.
  assertContextBudget(next);
  return { ...state, context: next };
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
    const snapshot = captureRepositorySnapshot(options.repositoryPath);
    assertRepositoryMatchesSnapshot(snapshot);
    const files = listRepositoryFilesAtCommit(
      snapshot.repositoryRoot,
      snapshot.commitSha
    );
    const allowed = new Set(allowedContextPaths);
    const fileTree = files
      .filter(
        (file) =>
          ["100644", "100755"].includes(file.mode) &&
          isInspectablePath(file.path) &&
          allowed.has(file.path)
      )
      .map(({ path }) => path)
      .sort();
    if (fileTree.length > limits.maxFileTreeEntries)
      throw new Error("Snapshot file tree exceeds maxFileTreeEntries.");
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
    const metadata = ["package.json", "AGENTS.md"].filter((path) =>
      fileTree.includes(path)
    );
    const metadataBytes = metadata.reduce(
      (sum, path) => sum + requireFile(files, path, limits).size!,
      0
    );
    if (byteLength(context) + metadataBytes > limits.maxContextBytes)
      throw new Error("Snapshot metadata exceeds maxContextBytes.");
    const contents = new Map(
      metadata.map((path) => [
        path,
        readRepositoryFileAtCommit(
          snapshot.repositoryRoot,
          snapshot.commitSha,
          path
        ),
      ])
    );
    context = {
      ...context,
      repository: {
        ...context.repository,
        packageScripts: parsePackageScripts(contents.get("package.json")),
        ...(contents.has("AGENTS.md")
          ? { instructions: contents.get("AGENTS.md")! }
          : {}),
      },
    };
    assertContextBudget(context);
    let state: StaffingContextState = {
      snapshot,
      context,
      files,
      allowedContextPaths: [...allowed],
    };
    const selected = selectGoalMentionedPaths(fileTree, goal.objective);
    // Preserve v1 optional seeding policy: skip over-budget selection rather than
    // trim it; skip large files and cap seed bytes at 64 KiB/file and 128 KiB total.
    if (
      selected.length <= limits.maxFilesPerRequest &&
      selected.length <= limits.maxTotalFiles
    ) {
      const small = selected.filter((path) => {
        const file = files.find((entry) => entry.path === path)!;
        return (
          file.size !== null &&
          file.size <= Math.min(64 * 1024, limits.maxFileBytes)
        );
      });
      const seedBytes = small.reduce(
        (sum, path) => sum + files.find((entry) => entry.path === path)!.size!,
        0
      );
      if (
        small.length > 0 &&
        seedBytes <= 128 * 1024 &&
        byteLength(context) + seedBytes <= limits.maxContextBytes
      ) {
        state = addInspectedFiles(state, small);
      }
    }
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
