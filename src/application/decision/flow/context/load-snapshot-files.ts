import type { InspectedFile } from "@/contracts/inspected-file.js";
import { readRepositoryFileAtCommit } from "@/infrastructure/git/index.js";
import { isRepositoryRelativePath } from "@/services/repository-inspection/index.js";

import type { RepositorySnapshot } from "@/contracts/repository-snapshot.js";

export function loadSnapshotFiles(
  snapshot: RepositorySnapshot,
  paths: string[]
): InspectedFile[] {
  for (const path of paths) {
    if (!isRepositoryRelativePath(path)) {
      throw new Error(
        `Decision context path must be a non-empty repository-relative path without traversal: ${path}.`
      );
    }
  }
  return paths.map((path) => ({
    path,
    content: readRepositoryFileAtCommit(
      snapshot.repositoryRoot,
      snapshot.commitSha,
      path
    ),
  }));
}
