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

export function readRepositoryFileAtCommit(
  repositoryRoot: string,
  commitSha: string,
  path: string
): string {
  let content: Buffer;
  try {
    content = execFileSync(
      "git",
      ["cat-file", "blob", `${commitSha}:${path}`],
      {
        cwd: repositoryRoot,
        stdio: "pipe",
      }
    );
  } catch (cause) {
    throw new Error(
      `Unable to read repository file at commit ${commitSha}: ${path}.`,
      { cause }
    );
  }
  if (content.includes(0)) {
    throw new Error(`Decision context file must be UTF-8 text: ${path}.`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      content
    );
  } catch (cause) {
    throw new Error(`Decision context file must be UTF-8 text: ${path}.`, {
      cause,
    });
  }
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
