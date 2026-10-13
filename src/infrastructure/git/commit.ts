import { execFileSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { isAbsolute, join, normalize, sep } from "node:path";

export function stagePaths(repositoryRoot: string, paths: string[]): void {
  if (paths.length === 0 || paths.some((path) => {
    const normalized = normalize(path);
    const target = join(repositoryRoot, path);
    return (existsSync(target) && lstatSync(target).isDirectory()) || !path || isAbsolute(path) || normalized === "." || normalized === ".." || normalized.startsWith(`..${sep}`);
  })) {
    throw new Error("Cannot stage changes: non-empty repository-relative file paths are required.");
  }
  try {
    const staged = execFileSync("git", ["diff", "--cached", "--name-only", "-z"], {
      cwd: repositoryRoot, encoding: "utf8", stdio: "pipe",
    });
    if (staged.length > 0) throw new Error("Repository already contains staged changes.");
    execFileSync("git", ["--literal-pathspecs", "add", "--", ...new Set(paths)], {
      cwd: repositoryRoot, stdio: "pipe",
    });
  } catch (cause) {
    throw new Error("Unable to stage execution changes. Existing staged changes must be committed separately.", { cause });
  }
}

export function commitChanges(repositoryRoot: string, message: string): string {
  try {
    execFileSync("git", ["commit", "-m", message], { cwd: repositoryRoot, stdio: "pipe" });
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot, encoding: "utf8", stdio: "pipe",
    }).trim();
  } catch (cause) {
    throw new Error("Unable to commit execution changes. Working tree changes were preserved.", { cause });
  }
}
