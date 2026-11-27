import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";

// Compare the staged snapshots around one patch, including deleted paths and
// both sides of renames. Paths come from Git's NUL-delimited index output.
export function applyWorkspacePatch(
  workspaceRoot: string,
  patch: Buffer,
  remaining: () => number
): string[] {
  const options = {
    cwd: workspaceRoot,
    stdio: "pipe" as const,
    killSignal: "SIGKILL" as const,
  };
  const revParse = (...args: string[]) =>
    execFileSync("git", ["rev-parse", ...args], {
      ...options,
      encoding: "utf8",
      timeout: remaining(),
    }).replace(/\n$/, "");
  if (
    realpathSync(revParse("--show-toplevel")) !== realpathSync(workspaceRoot) ||
    revParse("--absolute-git-dir") ===
      revParse("--path-format=absolute", "--git-common-dir")
  )
    throw new Error("Patch application requires a separate linked worktree.");
  const readIndex = () => {
    const entries = execFileSync("git", ["ls-files", "--stage", "-z"], {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      timeout: remaining(),
    });
    return new Map(
      entries
        .split("\0")
        .filter(Boolean)
        .map((entry) => {
          const tab = entry.indexOf("\t");
          return [entry.slice(tab + 1), entry.slice(0, tab)];
        })
    );
  };
  const before = readIndex();
  const args = [
    "-c",
    "apply.ignoreWhitespace=no",
    "apply",
    "--index",
    "--whitespace=nowarn",
  ];
  execFileSync("git", [...args, "--check", "-"], {
    ...options,
    timeout: remaining(),
    input: patch,
  });
  execFileSync("git", [...args, "-"], {
    ...options,
    timeout: remaining(),
    input: patch,
  });
  const after = readIndex();
  return [...new Set([...before.keys(), ...after.keys()])].filter(
    (path) => before.get(path) !== after.get(path)
  );
}
