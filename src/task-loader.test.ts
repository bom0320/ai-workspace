import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { loadTaskContract } from "./task-loader.js";

const temporaryDirectories: string[] = [];

function createTaskFile(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ai-workspace-task-"));
  const path = join(directory, "task.json");

  temporaryDirectories.push(directory);
  writeFileSync(path, contents);

  return path;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

describe("loadTaskContract", () => {
  it("loads and validates a valid TaskContract", () => {
    const task = {
      id: "task-001",
      goalId: "goal-001",
      objective: "Load a TaskContract from JSON",
      targetRepository: "ai-workspace",
      allowedPaths: ["src/task-loader.ts"],
      forbiddenPaths: ["docs/architecture.md"],
      constraints: ["Keep the loader small"],
      acceptanceCriteria: ["The TaskContract is validated"],
      verification: ["pnpm test"],
    };
    const path = createTaskFile(JSON.stringify(task));

    expect(loadTaskContract(path)).toEqual(task);
  });

  it("rejects malformed JSON", () => {
    const path = createTaskFile('{"id":');

    expect(() => loadTaskContract(path)).toThrow(SyntaxError);
  });

  it("rejects an invalid TaskContract", () => {
    const path = createTaskFile(JSON.stringify({ id: "" }));

    expect(() => loadTaskContract(path)).toThrow(ZodError);
  });

  it("reports a missing file", () => {
    expect(() => loadTaskContract("missing-task.json")).toThrow(/ENOENT/);
  });
});
