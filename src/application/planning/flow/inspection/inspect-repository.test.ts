import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { inspectRepository } from "./inspect-repository.js";

const temporaryDirectories: string[] = [];

function createRepository(): string {
  const directory = mkdtempSync(join(tmpdir(), "ai-workspace-inspection-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeFixture(repository: string, relativePath: string, contents = ""): void {
  const path = join(repository, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

describe("inspectRepository", () => {
  it("preserves the input repository root", () => {
    const repository = createRepository();
    expect(inspectRepository(repository).repositoryRoot).toBe(repository);
  });

  it("uses the root directory basename as the repository name", () => {
    const repository = createRepository();
    expect(inspectRepository(repository).repositoryName).toBe(basename(repository));
  });

  it("collects only relative file paths recursively and sorts them", () => {
    const repository = createRepository();
    const paths = ["z.txt", join("src", "contracts", "task.ts"), "AGENTS.md", join("src", "cli.ts")];
    for (const path of paths) {
      writeFixture(repository, path);
    }
    mkdirSync(join(repository, "empty"));

    expect(inspectRepository(repository).fileTree).toEqual([...paths].sort());
  });

  it.each([".git", "node_modules", ".ai-workspace"])(
    "excludes %s directories at every depth",
    (directory) => {
      const repository = createRepository();
      writeFixture(repository, join(directory, "nested", "ignored.txt"));
      writeFixture(repository, join("src", directory, "ignored.txt"));
      writeFixture(repository, join("src", "kept.ts"));

      expect(inspectRepository(repository).fileTree).toEqual([join("src", "kept.ts")]);
    },
  );

  it("reads only root package scripts and includes only string values", () => {
    const repository = createRepository();
    writeFixture(repository, "package.json", JSON.stringify({
      scripts: { typecheck: "tsc --noEmit", test: "vitest run", empty: "", number: 1, null: null, object: {}, array: [] },
    }));
    writeFixture(repository, join("nested", "package.json"), '{"scripts":{"build":"nested"}}');

    expect(inspectRepository(repository).packageScripts).toEqual({
      typecheck: "tsc --noEmit", test: "vitest run", empty: "",
    });
  });

  it("returns empty scripts when package.json is absent", () => {
    expect(inspectRepository(createRepository()).packageScripts).toEqual({});
  });

  it("returns empty scripts when scripts are absent", () => {
    const repository = createRepository();
    writeFixture(repository, "package.json", "{}");
    expect(inspectRepository(repository).packageScripts).toEqual({});
  });

  it.each([null, "test", 1, true, ["test"]])(
    "returns empty scripts for a non-object scripts value: %j",
    (scripts) => {
      const repository = createRepository();
      writeFixture(repository, "package.json", JSON.stringify({ scripts }));
      expect(inspectRepository(repository).packageScripts).toEqual({});
    },
  );

  it("throws for malformed package.json", () => {
    const repository = createRepository();
    writeFixture(repository, "package.json", '{"scripts":');
    expect(() => inspectRepository(repository)).toThrow(SyntaxError);
  });

  it("reads root AGENTS.md as UTF-8 without merging nested instructions", () => {
    const repository = createRepository();
    const instructions = "# 작업 규칙\nKeep changes minimal.\n";
    writeFixture(repository, "AGENTS.md", instructions);
    writeFixture(repository, join("src", "AGENTS.md"), "Nested instructions");
    expect(inspectRepository(repository).instructions).toBe(instructions);
  });

  it("returns undefined instructions when root AGENTS.md is absent", () => {
    const repository = createRepository();
    writeFixture(repository, join("src", "AGENTS.md"), "Nested instructions");
    expect(inspectRepository(repository).instructions).toBeUndefined();
  });

  it("preserves repository files and directory contents during inspection", () => {
    const repository = createRepository();
    const files = {
      "package.json": '{"scripts":{"test":"vitest run"}}',
      "AGENTS.md": "Repository instructions",
      [join("src", "file.ts")]: "export const value = 1;",
    };
    for (const [path, contents] of Object.entries(files)) {
      writeFixture(repository, path, contents);
    }

    inspectRepository(repository);

    for (const [path, contents] of Object.entries(files)) {
      expect(readFileSync(join(repository, path), "utf8")).toBe(contents);
    }
    expect(inspectRepository(repository).fileTree).toEqual(Object.keys(files).sort());
  });
});
