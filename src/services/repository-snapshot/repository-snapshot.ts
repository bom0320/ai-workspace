import {
  getRepositoryHead,
  isRepositoryClean,
  resolveRepositoryRoot,
} from "@/infrastructure/git/index.js";

import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";

// A successful Repository read found a changed baseline, rather than an I/O failure.
export class RepositorySnapshotMismatchError extends Error {}

export function captureRepositorySnapshot(
  repositoryPath: string
): RepositorySnapshot {
  const repositoryRoot = resolveRepositoryRoot(repositoryPath);
  if (!isRepositoryClean(repositoryRoot)) {
    throw new Error(
      "Cannot capture repository snapshot: repository has uncommitted or untracked changes."
    );
  }

  return { repositoryRoot, commitSha: getRepositoryHead(repositoryRoot) };
}

export function assertRepositoryMatchesSnapshot(
  snapshot: RepositorySnapshot
): void {
  const currentHead = getRepositoryHead(snapshot.repositoryRoot);
  if (currentHead !== snapshot.commitSha) {
    throw new RepositorySnapshotMismatchError(
      `Repository HEAD changed: expected ${snapshot.commitSha}, received ${currentHead}.`
    );
  }
  if (!isRepositoryClean(snapshot.repositoryRoot)) {
    throw new RepositorySnapshotMismatchError(
      "Repository working tree became dirty: uncommitted or untracked changes detected."
    );
  }
}
