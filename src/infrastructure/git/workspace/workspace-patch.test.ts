import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  writeWorkspacePatch,
  WorkspacePatchCleanupError,
} from "./workspace-patch.js";

vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
}));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
}));

let directory: string;
let root: string;
let output: string;
let base: string;
const git = (...args: string[]) =>
  childProcess.execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
beforeEach(() => {
  directory = fs.mkdtempSync(join(tmpdir(), "ai-workspace-workspace-patch-"));
  root = join(directory, "repository");
  output = join(directory, "output");
  fs.mkdirSync(root);
  fs.mkdirSync(output);
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  fs.writeFileSync(join(root, "modified.txt"), "before\n");
  fs.writeFileSync(join(root, "deleted.txt"), "delete me\n");
  fs.writeFileSync(join(root, "binary.bin"), Buffer.from([0, 1, 2, 3]));
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");
  base = git("rev-parse", "HEAD").trim();
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

function expectNoTemporaryIndex(): void {
  expect(
    fs.readdirSync(output).filter((name) => name.startsWith(".patch-index-"))
  ).toEqual([]);
}

describe("writeWorkspacePatch", () => {
  it("preserves binary, deleted, committed, unstaged and untracked changes while leaving the real index byte-identical", () => {
    fs.writeFileSync(join(root, "modified.txt"), "worker commit\n");
    git("add", "modified.txt");
    git("commit", "--quiet", "-m", "worker");
    fs.writeFileSync(join(root, "modified.txt"), "staged version\n");
    git("add", "modified.txt");
    fs.writeFileSync(join(root, "modified.txt"), "final version\n");
    fs.writeFileSync(join(root, "untracked.txt"), "new file\n");
    fs.rmSync(join(root, "deleted.txt"));
    const binary = Buffer.from([0, 9, 8, 7, 6]);
    fs.writeFileSync(join(root, "binary.bin"), binary);
    const before = git("status", "--porcelain", "-z");
    const index = fs.readFileSync(join(root, ".git", "index"));
    const patch = join(output, "complete.patch");
    const remove = vi.spyOn(fs, "rmSync");
    writeWorkspacePatch(root, base, patch);
    expect(fs.readFileSync(join(root, ".git", "index"))).toEqual(index);
    expect(git("status", "--porcelain", "-z")).toBe(before);
    const text = fs.readFileSync(patch, "utf8");
    expect(text).toContain("GIT binary patch");
    expect(text).toMatch(/index [a-f0-9]{40}\.\.[a-f0-9]{40}/);
    expect(remove).toHaveBeenCalledWith(
      expect.stringContaining(".patch-index-"),
      { force: true }
    );
    expectNoTemporaryIndex();
    const restored = join(directory, "restored");
    childProcess.execFileSync("git", ["clone", "--quiet", root, restored], {
      stdio: "pipe",
    });
    childProcess.execFileSync(
      "git",
      ["-C", restored, "checkout", "--detach", base],
      { stdio: "pipe" }
    );
    childProcess.execFileSync(
      "git",
      ["-C", restored, "apply", "--check", patch],
      { stdio: "pipe" }
    );
    childProcess.execFileSync(
      "git",
      ["-C", restored, "apply", "--binary", patch],
      { stdio: "pipe" }
    );
    expect(fs.readFileSync(join(restored, "modified.txt"), "utf8")).toBe(
      "final version\n"
    );
    expect(fs.readFileSync(join(restored, "untracked.txt"), "utf8")).toBe(
      "new file\n"
    );
    expect(fs.readFileSync(join(restored, "binary.bin"))).toEqual(binary);
    expect(fs.existsSync(join(restored, "deleted.txt"))).toBe(false);
  });

  it("streams a patch larger than the default process buffer without truncation", () => {
    const large = "large line\n".repeat(150_000);
    fs.writeFileSync(join(root, "modified.txt"), large);
    const patch = join(output, "large.patch");
    writeWorkspacePatch(root, base, patch);
    expect(fs.statSync(patch).size).toBeGreaterThan(1024 * 1024);
    expect(fs.readFileSync(patch, "utf8")).toContain("+large line\n");
    git("checkout", "--", "modified.txt");
    git("apply", "--check", patch);
    git("apply", patch);
    expect(fs.readFileSync(join(root, "modified.txt"), "utf8")).toBe(large);
    expectNoTemporaryIndex();
  });

  it("does not truncate an existing patch when read-tree fails and cleans its temporary index", () => {
    const patch = join(output, "preserved.patch");
    fs.writeFileSync(patch, "previous patch");
    const index = fs.readFileSync(join(root, ".git", "index"));
    expect(() => writeWorkspacePatch(root, "missing-base", patch)).toThrow();
    expect(fs.readFileSync(patch, "utf8")).toBe("previous patch");
    expect(fs.readFileSync(join(root, ".git", "index"))).toEqual(index);
    expectNoTemporaryIndex();
  });

  it("cleans the temporary index on output file open failure", () => {
    const path = join(output, "is-a-directory");
    fs.mkdirSync(path);
    expect(() => writeWorkspacePatch(root, base, path)).toThrow();
    expectNoTemporaryIndex();
  });

  it("closes the patch descriptor and removes the temporary index when git diff fails", () => {
    const execute = childProcess.execFileSync;
    const close = vi.spyOn(fs, "closeSync");
    const error = new Error("Git diff failed");
    vi.spyOn(childProcess, "execFileSync").mockImplementation(
      (...args: unknown[]) => {
        if (Array.isArray(args[1]) && args[1].includes("--full-index"))
          throw error;
        return Reflect.apply(execute, childProcess, args);
      }
    );
    expect(() =>
      writeWorkspacePatch(root, base, join(output, "failed.patch"))
    ).toThrow(error);
    expect(close).toHaveBeenCalledTimes(1);
    expectNoTemporaryIndex();
  });

  it("identifies cleanup failures and preserves their original cause", () => {
    const error = Object.assign(new Error("Cannot remove temporary index"), {
      code: "EACCES",
    });
    vi.spyOn(fs, "rmSync").mockImplementationOnce(() => {
      throw error;
    });
    const close = vi.spyOn(fs, "closeSync");
    try {
      writeWorkspacePatch(root, base, join(output, "complete.patch"));
      expect.fail("Cleanup should fail");
    } catch (caught) {
      expect(caught).toBeInstanceOf(WorkspacePatchCleanupError);
      expect((caught as Error).cause).toBe(error);
    }
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("preserves cleanup error precedence when Git generation also fails", () => {
    const original = new Error("Temporary index cleanup failed");
    vi.spyOn(fs, "rmSync").mockImplementationOnce(() => {
      throw original;
    });
    try {
      writeWorkspacePatch(root, "missing-base", join(output, "failed.patch"));
      expect.fail("Cleanup should fail");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspacePatchCleanupError);
      expect((error as Error).cause).toBe(original);
    }
  });
});
