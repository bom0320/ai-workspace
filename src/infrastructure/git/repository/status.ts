import { execFileSync } from "node:child_process";

export function isRepositoryClean(repositoryRoot: string): boolean {
  return (
    execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim() === ""
  );
}
