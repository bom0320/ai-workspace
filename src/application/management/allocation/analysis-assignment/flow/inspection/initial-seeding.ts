import { selectGoalMentionedPaths } from "@/services/repository-inspection/index.js";

import type { StaffingContextState } from "../../model/state.js";
import { addInspectedFiles } from "./inspect-files.js";
import { byteLength } from "./context-policy.js";

export function seedInitialFiles(
  state: StaffingContextState
): StaffingContextState {
  const { context, files } = state;
  const { goal, limits } = context;
  const { fileTree } = context.repository;
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
      return addInspectedFiles(state, small);
    }
  }
  return state;
}
