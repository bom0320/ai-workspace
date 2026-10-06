import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveRepositoryRoot } from "./repository.js";

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

describe("resolveRepositoryRoot", () => {
  it("resolves a valid Git repository to an absolute path", () => {
    const repository = createTemporaryDirectory();

    writeFileSync(join(repository, ".git"), "gitdir: /tmp/example.git");

    expect(resolveRepositoryRoot(repository)).toBe(resolve(repository));
  });

  it("rejects a path that does not exist", () => {
    const directory = createTemporaryDirectory();

    expect(() => resolveRepositoryRoot(join(directory, "missing"))).toThrow(
      "Repository path does not exist",
    );
  });

  it("rejects a file path", () => {
    const directory = createTemporaryDirectory();
    const file = join(directory, "file.txt");

    writeFileSync(file, "not a repository");

    expect(() => resolveRepositoryRoot(file)).toThrow(
      "Repository path is not a directory",
    );
  });

  it("rejects a directory that is not a Git repository", () => {
    const directory = createTemporaryDirectory();
    const nestedDirectory = join(directory, "not-a-repository");

    mkdirSync(nestedDirectory);

    expect(() => resolveRepositoryRoot(nestedDirectory)).toThrow(
      "Path is not a Git repository",
    );
  });
});
