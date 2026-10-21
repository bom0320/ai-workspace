import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listRepositoryFilesAtCommit } from "./commit-files.js";

let root: string;
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ai-workspace-commit-files-"));
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "한글 with spaces.txt"), "한글\n");
  symlinkSync("한글 with spaces.txt", join(root, "link"));
  git("add", "."); git("commit", "--quiet", "-m", "fixture");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("listRepositoryFilesAtCommit", () => {
  it("returns exact paths, byte sizes and modes from the requested commit", () => {
    const sha = git("rev-parse", "HEAD").trim();
    const entries = listRepositoryFilesAtCommit(root, sha);
    expect(entries).toContainEqual({ path: "한글 with spaces.txt", size: Buffer.byteLength("한글\n"), mode: "100644" });
    expect(entries).toContainEqual({ path: "link", size: Buffer.byteLength("한글 with spaces.txt"), mode: "120000" });
    writeFileSync(join(root, "new.txt"), "new commit");
    git("add", "."); git("commit", "--quiet", "-m", "next");
    expect(listRepositoryFilesAtCommit(root, sha)).toEqual(entries);
    expect(listRepositoryFilesAtCommit(root, git("rev-parse", "HEAD").trim())).toHaveLength(3);
  });

  it.each(["HEAD", "--help", "HEAD:src", "abc123", "0".repeat(40)])("rejects invalid or nonexistent commits %j", (sha) => {
    expect(() => listRepositoryFilesAtCommit(root, sha)).toThrow();
  });
});
