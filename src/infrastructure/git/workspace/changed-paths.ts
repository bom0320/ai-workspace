import { execFileSync } from "node:child_process";

// Exact Git paths, including whitespace/newlines; no shell parsing or quoting.
// Callers attach their own Evidence / use-case failure meaning.
export function getWorkspaceChangedPaths(
  workspaceRoot: string,
  baseCommit: string
): string[] {
  const tracked = execFileSync(
    "git",
    ["-C", workspaceRoot, "diff", "--name-only", "-z", baseCommit, "--"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  const untracked = execFileSync(
    "git",
    ["-C", workspaceRoot, "ls-files", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return [
    ...new Set(
      `${tracked}${untracked}`.split("\0").filter((path) => path.length > 0)
    ),
  ].sort();
}
