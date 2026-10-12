import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { inspectFiles, InspectionRequestError } from "./inspect-files.js";

vi.mock("node:fs", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs")>(),
}));

const temporaryDirectories: string[] = [];

function createRepository(): string {
  const directory = mkdtempSync(join(tmpdir(), "ai-workspace-inspect-files-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeFixture(repository: string, path: string, content = "fixture"): void {
  const absolutePath = join(repository, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

describe("inspectFiles", () => {
  it("reads one requested file and preserves its relative path and UTF-8 content", () => {
    const repository = createRepository();
    const path = join("src", "cli.ts");
    const content = "// 파일 내용 🌱\n";
    writeFixture(repository, path, content);

    expect(inspectFiles(repository, { paths: [path] })).toEqual({
      files: [{ path, content }],
    });
  });

  it("reads only requested files in first-request order and removes duplicates", () => {
    const repository = createRepository();
    writeFixture(repository, "z.ts", "last alphabetically");
    writeFixture(repository, "a.ts", "first alphabetically");
    writeFixture(repository, "unrequested.ts");

    expect(inspectFiles(repository, { paths: ["z.ts", "a.ts", "z.ts", "a.ts"] })).toEqual({
      files: [
        { path: "z.ts", content: "last alphabetically" },
        { path: "a.ts", content: "first alphabetically" },
      ],
    });
  });

  it("returns an empty result for an empty request", () => {
    expect(inspectFiles(createRepository(), { paths: [] })).toEqual({ files: [] });
  });

  it("allows normalization within the repository and deduplicates the same file", () => {
    const repository = createRepository();
    mkdirSync(join(repository, "src"));
    writeFixture(repository, "package.json", "{}");
    const requestedPath = `src${sep}..${sep}package.json`;

    expect(inspectFiles(repository, { paths: [requestedPath, "package.json"] })).toEqual({
      files: [{ path: requestedPath, content: "{}" }],
    });
  });

  it("rejects absolute paths even when they point inside the repository", () => {
    const repository = createRepository();
    writeFixture(repository, "file.ts");
    expect(() => inspectFiles(repository, { paths: [join(repository, "file.ts")] })).toThrow(/relative/);
    expect(() => inspectFiles(repository, { paths: [join(repository, "file.ts")] })).toThrow(InspectionRequestError);
  });

  it.each(["../secret.txt", "../../outside.ts", "src/../../secret.txt"])(
    "rejects repository escape: %s",
    (path) => {
      expect(() => inspectFiles(createRepository(), { paths: [path] })).toThrow(/outside/);
      expect(() => inspectFiles(createRepository(), { paths: [path] })).toThrow(InspectionRequestError);
    },
  );

  it("rejects escape into a sibling whose name starts with the repository name", () => {
    const parent = createRepository();
    const root = join(parent, "repo");
    mkdirSync(root);
    writeFixture(parent, join("repo-other", "secret.txt"));
    expect(() => inspectFiles(root, { paths: [join("..", "repo-other", "secret.txt")] })).toThrow(/outside/);
  });

  it.each([".git", "node_modules", ".ai-workspace"])(
    "rejects root and nested %s paths",
    (directory) => {
      const repository = createRepository();
      for (const path of [join(directory, "file.txt"), join("src", directory, "file.txt")]) {
        writeFixture(repository, path);
        expect(() => inspectFiles(repository, { paths: [path] })).toThrow(/forbidden/);
        expect(() => inspectFiles(repository, { paths: [path] })).toThrow(InspectionRequestError);
      }
    },
  );

  it("rejects a forbidden component even when normalization removes it", () => {
    const repository = createRepository();
    writeFixture(repository, "file.txt");
    expect(() => inspectFiles(repository, { paths: ["node_modules/../file.txt"] })).toThrow(/forbidden/);
  });

  it("rejects directories including the repository root", () => {
    const repository = createRepository();
    mkdirSync(join(repository, "src"));
    for (const path of ["src", ".", ""]) {
      expect(() => inspectFiles(repository, { paths: [path] })).toThrow(/not a file/);
      expect(() => inspectFiles(repository, { paths: [path] })).toThrow(InspectionRequestError);
    }
  });

  it("rejects missing files without returning a partial result", () => {
    const repository = createRepository();
    writeFixture(repository, "valid.ts");
    expect(() => inspectFiles(repository, { paths: ["valid.ts", "missing.ts"] })).toThrow(/ENOENT/);
    expect(() => inspectFiles(repository, { paths: ["valid.ts", "missing.ts"] })).toThrow(InspectionRequestError);
  });

  it("classifies a path through a regular file as a request error", () => {
    const repository = createRepository();
    writeFixture(repository, "file.ts");
    expect(() => inspectFiles(repository, { paths: [join("file.ts", "child.ts")] })).toThrow(InspectionRequestError);
  });

  it.each(["statSync", "readFileSync"] as const)(
    "preserves unexpected %s errors without wrapping them", (operation) => {
      const repository = createRepository();
      writeFixture(repository, "file.ts");
      const error = Object.assign(new Error("Permission denied"), { code: "EACCES" });
      vi.spyOn(fs, operation).mockImplementation(() => { throw error; });

      expect(() => inspectFiles(repository, { paths: ["file.ts"] })).toThrow(error);
      try {
        inspectFiles(repository, { paths: ["file.ts"] });
      } catch (caught) {
        expect(caught).toBe(error);
        expect(caught).not.toBeInstanceOf(InspectionRequestError);
      }
    },
  );

  it("preserves file contents and directory entries during inspection", () => {
    const repository = createRepository();
    writeFixture(repository, "file.ts", "original 내용\n");
    const before = readFileSync(join(repository, "file.ts"));
    const entriesBefore = readdirSync(repository);

    inspectFiles(repository, { paths: ["file.ts"] });

    expect(readFileSync(join(repository, "file.ts"))).toEqual(before);
    expect(readdirSync(repository)).toEqual(entriesBefore);
  });
});
