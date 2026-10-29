import {
  getRepositoryHead,
  isRepositoryClean,
  resolveRepositoryRoot,
} from "@/infrastructure/git/index.js";

import type { RepositorySnapshot } from "@/contracts/repository-snapshot.js";

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
    throw new Error(
      `Repository HEAD changed: expected ${snapshot.commitSha}, received ${currentHead}.`
    );
  }
  if (!isRepositoryClean(snapshot.repositoryRoot)) {
    throw new Error(
      "Repository working tree became dirty: uncommitted or untracked changes detected."
    );
  }
}
