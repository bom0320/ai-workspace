import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getRepositoryHead,
  readRepositoryFileAtCommit,
  resolveRepositoryRoot,
} from "./repository.js";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "ai-workspace-repository-"));

  temporaryDirectories.push(directory);

  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

describe("getRepositoryHead", () => {
  it("returns the current commit SHA without a trailing newline", () => {
    const repository = createTemporaryDirectory();
    const git = (...args: string[]) =>
      execFileSync("git", args, {
        cwd: repository,
        encoding: "utf8",
        stdio: "pipe",
      });
    git("init", "--quiet");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    git("commit", "--quiet", "--allow-empty", "-m", "initial");
    const expectedHead = git("rev-parse", "HEAD").trim();

    expect(getRepositoryHead(repository)).toBe(expectedHead);
    git("commit", "--quiet", "--allow-empty", "-m", "next");
    expect(getRepositoryHead(repository)).not.toBe(expectedHead);
    expect(getRepositoryHead(repository)).toBe(git("rev-parse", "HEAD").trim());
  });

  it("fails when the repository has no HEAD commit", () => {
    const repository = createTemporaryDirectory();
    execFileSync("git", ["init", "--quiet"], {
      cwd: repository,
      stdio: "pipe",
    });

    expect(() => getRepositoryHead(repository)).toThrow();
  });
});

describe("resolveRepositoryRoot", () => {
  it("resolves a valid Git repository to an absolute path", () => {
    const repository = createTemporaryDirectory();

    writeFileSync(join(repository, ".git"), "gitdir: /tmp/example.git");

    expect(resolveRepositoryRoot(repository)).toBe(resolve(repository));
  });

  it("rejects a path that does not exist", () => {
    const directory = createTemporaryDirectory();

    expect(() => resolveRepositoryRoot(join(directory, "missing"))).toThrow(
      "Repository path does not exist"
    );
  });

  it("rejects a file path", () => {
    const directory = createTemporaryDirectory();
    const file = join(directory, "file.txt");

    writeFileSync(file, "not a repository");

    expect(() => resolveRepositoryRoot(file)).toThrow(
      "Repository path is not a directory"
    );
  });

  it("rejects a directory that is not a Git repository", () => {
    const directory = createTemporaryDirectory();
    const nestedDirectory = join(directory, "not-a-repository");

    mkdirSync(nestedDirectory);

    expect(() => resolveRepositoryRoot(nestedDirectory)).toThrow(
      "Path is not a Git repository"
    );
  });
});

describe("readRepositoryFileAtCommit", () => {
  let repository: string;
  let commitSha: string;
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: repository,
      encoding: "utf8",
      stdio: "pipe",
    });
  beforeEach(() => {
    repository = createTemporaryDirectory();
    git("init", "--quiet");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    writeFileSync(join(repository, "example.txt"), "snapshot contents\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "initial");
    commitSha = getRepositoryHead(repository);
  });

  it("reads the exact text from a specified commit", () => {
    expect(
      readRepositoryFileAtCommit(repository, commitSha, "example.txt")
    ).toBe("snapshot contents\n");
  });

  it("ignores newer commits and working tree changes", () => {
    writeFileSync(join(repository, "example.txt"), "new commit\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "next");
    writeFileSync(join(repository, "example.txt"), "uncommitted contents\n");
    expect(
      readRepositoryFileAtCommit(repository, commitSha, "example.txt")
    ).toBe("snapshot contents\n");
  });

  it("rejects files not present in that commit, even if they exist in the working tree", () => {
    writeFileSync(join(repository, "new.txt"), "working tree only");
    expect(() =>
      readRepositoryFileAtCommit(repository, commitSha, "new.txt")
    ).toThrow("Unable to read repository file at commit");
  });

  it("rejects a directory rather than returning a tree listing", () => {
    mkdirSync(join(repository, "src"));
    writeFileSync(join(repository, "src", "file.ts"), "// example");
    git("add", ".");
    git("commit", "--quiet", "-m", "add directory");
    expect(() =>
      readRepositoryFileAtCommit(
        repository,
        getRepositoryHead(repository),
        "src"
      )
    ).toThrow("Unable to read repository file at commit");
  });

  it.each([Buffer.from([0, 1, 2]), Buffer.from([0xff, 0xfe])])(
    "rejects binary or invalid UTF-8 contents: %j",
    (contents) => {
      writeFileSync(join(repository, "binary.dat"), contents);
      git("add", ".");
      git("commit", "--quiet", "-m", "binary");
      expect(() =>
        readRepositoryFileAtCommit(
          repository,
          getRepositoryHead(repository),
          "binary.dat"
        )
      ).toThrow("must be UTF-8 text");
    }
  );
});
