import { statSync } from "node:fs";
import { basename, join, sep } from "node:path";

import type { PlanningLimits } from "../../model/limits.js";
import type { RepositoryInfo } from "../../model/state.js";
import type { InspectedFile } from "../../protocol/inspection.js";
import { inspectFiles } from "./inspect-files.js";

const MAX_INITIAL_FILE_BYTES = 64 * 1024;
const MAX_INITIAL_CONTEXT_BYTES = 128 * 1024;

export function inspectInitialFiles(
  repository: RepositoryInfo,
  objective: string,
  limits: PlanningLimits,
): InspectedFile[] {
  if (!Object.values(limits).every((value) => Number.isSafeInteger(value) && value >= 0) || limits.maxRounds === 0) {
    return [];
  }
  const goal = objective.replaceAll("\\", "/");
  const mentions = (name: string): boolean => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9_./-])${escaped}(?=$|[^a-z0-9_./-])`, "i").test(goal);
  };
  const names = new Map<string, number>();
  for (const path of repository.fileTree) {
    const name = basename(path).toLowerCase();
    names.set(name, (names.get(name) ?? 0) + 1);
  }
  const paths = repository.fileTree.filter((path) => {
    const name = basename(path).toLowerCase();
    const normalizedPath = path.split(sep).join("/");
    return (normalizedPath.includes("/") && mentions(normalizedPath)) ||
      (names.get(name) === 1 && mentions(name)) ||
      (path.toLowerCase() === "readme.md" && mentions("README"));
  });
  // Optional seeding is skipped rather than trimming an over-budget selection.
  if (paths.length > limits.maxFilesPerRequest || paths.length > limits.maxTotalFiles) return [];
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
