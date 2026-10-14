import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export function getRepositoryHead(repositoryRoot: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();
}

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
