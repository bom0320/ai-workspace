import { execFileSync } from "node:child_process";

export class PushBlockedError extends Error {}

export function getCurrentBranch(repositoryRoot: string): string {
  try {
    const branch = execFileSync(
      "git",
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: "pipe",
      }
    ).trim();
    if (!branch) throw new Error("No branch");
    return branch;
  } catch (cause) {
    throw new PushBlockedError(
      "Cannot identify current branch; detached HEAD cannot be pushed.",
      { cause }
    );
  }
}

export function pushCurrentBranch(
  repositoryRoot: string,
  commitSha: string
): void {
  const branch = getCurrentBranch(repositoryRoot);
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
    if (!commitSha || head !== commitSha)
      throw new Error("Commit does not match HEAD");
  } catch (cause) {
    throw new PushBlockedError(
      "Current HEAD does not match the delivery commit.",
      { cause }
    );
  }
  let remote: string;
  let target: string;
  try {
    execFileSync("git", ["rev-parse", "--verify", "@{upstream}"], {
      cwd: repositoryRoot,
      stdio: "pipe",
    });
    remote = execFileSync(
      "git",
      ["config", "--get", `branch.${branch}.remote`],
      { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" }
    ).trim();
    target = execFileSync(
      "git",
      ["config", "--get", `branch.${branch}.merge`],
      { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" }
    ).trim();
    if (!remote || remote === "." || !target.startsWith("refs/heads/"))
      throw new Error("Invalid upstream");
    execFileSync("git", ["remote", "get-url", "--", remote], {
      cwd: repositoryRoot,
      stdio: "pipe",
    });
  } catch (cause) {
    throw new PushBlockedError(
      "Current branch has no resolvable remote upstream.",
      { cause }
    );
  }
  try {
    // Explicit upstream refspec prevents push.default or configured push refspecs
    // from delivering other branches. No force option is ever passed.
    execFileSync(
      "git",
      ["push", "--no-force", "--", remote, `HEAD:${target}`],
      { cwd: repositoryRoot, stdio: "pipe" }
    );
  } catch (cause) {
    throw new Error("Unable to push commit. Local commit was preserved.", {
      cause,
    });
  }
}
