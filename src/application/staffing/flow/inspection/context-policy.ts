import type { CommitFile } from "@/infrastructure/git/index.js";
import {
  isInternalInspectionComponent,
  isUnambiguousRepositoryPath,
} from "@/services/repository-inspection/index.js";

import type { StaffingContextState } from "../../model/state.js";
import type {
  StaffingContext,
  StaffingInspectionLimits,
} from "../../protocol/context.js";

export function isInspectablePath(path: string): boolean {
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

export function byteLength(context: StaffingContext): number {
  return Buffer.byteLength(JSON.stringify(context), "utf8");
}

export function assertContextBudget(context: StaffingContext): void {
  if (byteLength(context) > context.limits.maxContextBytes)
    throw new Error("Staffing context exceeds maxContextBytes.");
}

export function requireFile(
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

// Validate the complete batch before allowing any Git blob reads.
export function prepareInspection(
  state: StaffingContextState,
  paths: string[]
): {
  paths: string[];
  remainingInspectionBudget: number;
} {
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
  return {
    paths: fresh,
    remainingInspectionBudget:
      limits.maxTotalFiles - inspected.size - fresh.length,
  };
}

export function createAllowedFileTree(
  files: CommitFile[],
  allowed: ReadonlySet<string>,
  limits: StaffingInspectionLimits
): string[] {
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
  return fileTree;
}

// Root metadata follows the same regular-file and byte limits as inspection,
// but does not consume the inspected-file count budget.
export function prepareMetadataInspection(
  files: CommitFile[],
  context: StaffingContext
): string[] {
  const { fileTree } = context.repository;
  const { limits } = context;
  const metadata = ["package.json", "AGENTS.md"].filter((path) =>
    fileTree.includes(path)
  );
  const metadataBytes = metadata.reduce(
    (sum, path) => sum + requireFile(files, path, limits).size!,
    0
  );
  if (byteLength(context) + metadataBytes > limits.maxContextBytes)
    throw new Error("Snapshot metadata exceeds maxContextBytes.");
  return metadata;
}
