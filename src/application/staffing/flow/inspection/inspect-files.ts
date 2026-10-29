import type { RepositorySnapshot } from "@/contracts/repository-snapshot.js";
import {
  readRepositoryFileAtCommit,
  type CommitFile,
} from "@/infrastructure/git/index.js";
import { parsePackageScripts } from "@/services/repository-inspection/index.js";

import type { StaffingContextState } from "../../model/state.js";
import type { StaffingContext } from "../../protocol/context.js";
import {
  assertContextBudget,
  prepareInspection,
  prepareMetadataInspection,
} from "./policy.js";

// Metadata is separately bounded and contributes to Context bytes, not the
// inspected-file count. Preflight all metadata sizes before reading any blob.
export function loadRepositoryMetadata(
  snapshot: RepositorySnapshot,
  files: CommitFile[],
  context: StaffingContext
): StaffingContext {
  const metadata = prepareMetadataInspection(files, context);
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
  const next: StaffingContext = {
    ...context,
    repository: {
      ...context.repository,
      packageScripts: parsePackageScripts(contents.get("package.json")),
      ...(contents.has("AGENTS.md")
        ? { instructions: contents.get("AGENTS.md")! }
        : {}),
    },
  };
  assertContextBudget(next);
  return next;
}

// File access is reached only after the pure policy validates the entire batch.
export function addInspectedFiles(
  state: StaffingContextState,
  paths: string[]
): StaffingContextState {
  const inspection = prepareInspection(state, paths);
  const files = inspection.paths.map((path) => ({
    path,
    content: readRepositoryFileAtCommit(
      state.snapshot.repositoryRoot,
      state.snapshot.commitSha,
      path
    ),
  }));
  const next: StaffingContext = {
    ...state.context,
    inspectedFiles: [...state.context.inspectedFiles, ...files],
    remainingInspectionBudget: inspection.remainingInspectionBudget,
  };
  // JSON escaping and field overhead also count toward the actual Context size.
  assertContextBudget(next);
  return { ...state, context: next };
}
