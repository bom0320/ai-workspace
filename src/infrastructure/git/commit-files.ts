import { execFileSync } from "node:child_process";

export type CommitFile = { path: string; mode: string; size: number | null };

// Literal commit identity only. No revision expressions or pathspec filtering.
export function listRepositoryFilesAtCommit(
  repositoryRoot: string,
  commitSha: string
): CommitFile[] {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commitSha)) {
    throw new Error("Snapshot must identify a full commit SHA.");
  }
  const output = execFileSync(
    "git",
    ["ls-tree", "-r", "-l", "-z", "--full-tree", commitSha],
    {
      cwd: repositoryRoot,
      stdio: "pipe",
      maxBuffer: 8 * 1024 * 1024,
    }
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(output);
  return text
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const match =
        /^(\d{6}) (blob|commit) [a-f0-9]+\s+(\d+|-)\t([\s\S]+)$/.exec(entry);
      if (!match) throw new Error("Invalid Git tree entry.");
      const size = match[3] === "-" ? null : Number(match[3]);
      if (size !== null && !Number.isSafeInteger(size))
        throw new Error("Invalid Git blob size.");
      return { mode: match[1], size, path: match[4] };
    });
}
