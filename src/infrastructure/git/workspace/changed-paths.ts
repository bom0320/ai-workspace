import {
  execFileSync,
  type ExecFileSyncOptionsWithStringEncoding,
} from "node:child_process";

// Exact Git paths, including whitespace/newlines; no shell parsing or quoting.
// Callers attach their own Evidence / use-case failure meaning.
export function getWorkspaceChangedPaths(
  workspaceRoot: string,
  baseCommit: string,
  remaining?: () => number
): string[] {
  const options = (): ExecFileSyncOptionsWithStringEncoding => ({
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...(remaining && { timeout: remaining(), killSignal: "SIGKILL" }),
  });
  const tracked = execFileSync(
    "git",
    [
      "-C",
      workspaceRoot,
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--name-only",
      "-z",
      baseCommit,
      "--",
    ],
    options()
  );
  const staged = execFileSync(
    "git",
    [
      "-C",
      workspaceRoot,
      "diff",
      "--cached",
      "--no-ext-diff",
      "--no-textconv",
      "--name-only",
      "-z",
      baseCommit,
      "--",
    ],
    options()
  );
  const untracked = execFileSync(
    "git",
    ["-C", workspaceRoot, "ls-files", "--others", "--exclude-standard", "-z"],
    options()
  );
  return [
    ...new Set(
      `${tracked}${staged}${untracked}`
        .split("\0")
        .filter((path) => path.length > 0)
    ),
  ].sort();
}
