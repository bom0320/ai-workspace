import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export function resolveRepositoryRoot(path: string): string {
  const repositoryRoot = resolve(path);

  if (!existsSync(repositoryRoot)) {
    throw new Error(`Repository path does not exist: ${repositoryRoot}`);
  }

  if (!statSync(repositoryRoot).isDirectory()) {
    throw new Error(`Repository path is not a directory: ${repositoryRoot}`);
  }

  if (!existsSync(join(repositoryRoot, ".git"))) {
    throw new Error(`Path is not a Git repository: ${repositoryRoot}`);
  }

  return repositoryRoot;
}
