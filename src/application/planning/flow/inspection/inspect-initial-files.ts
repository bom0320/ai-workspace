import { statSync } from "node:fs";
import { join } from "node:path";

import { selectGoalMentionedPaths } from "@/services/repository-inspection/index.js";

import type { PlanningLimits } from "../../model/limits.js";
import type { RepositoryInfo } from "../../model/state.js";
import type { InspectedFile } from "../../protocol/inspection.js";
import { inspectFiles } from "./inspect-files.js";

const MAX_INITIAL_FILE_BYTES = 64 * 1024;
const MAX_INITIAL_CONTEXT_BYTES = 128 * 1024;

export function inspectInitialFiles(
  repository: RepositoryInfo,
  objective: string,
  limits: PlanningLimits
): InspectedFile[] {
  if (
    !Object.values(limits).every(
      (value) => Number.isSafeInteger(value) && value >= 0
    ) ||
    limits.maxRounds === 0
  ) {
    return [];
  }
  const paths = selectGoalMentionedPaths(repository.fileTree, objective);
  // Optional seeding is skipped rather than trimming an over-budget selection.
  if (
    paths.length > limits.maxFilesPerRequest ||
    paths.length > limits.maxTotalFiles
  )
    return [];
  let bytes = 0;
  const smallFiles = paths.filter((path) => {
    const size = statSync(join(repository.repositoryRoot, path)).size;
    if (size > MAX_INITIAL_FILE_BYTES) return false;
    bytes += size;
    return true;
  });
  if (bytes > MAX_INITIAL_CONTEXT_BYTES) return [];
  return inspectFiles(repository.repositoryRoot, { paths: smallFiles }).files;
}
