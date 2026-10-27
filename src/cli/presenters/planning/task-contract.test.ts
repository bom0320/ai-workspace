import { afterEach, describe, expect, it, vi } from "vitest";

import type { TaskContract } from "@/contracts/task.js";

import { presentTaskContract } from "./task-contract.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const task: TaskContract = {
  id: "task-001",
  goalId: "goal-001",
  objective: "Clarify README",
  targetRepository: "example",
  allowedPaths: ["README.md", "docs/intro.md"],
  forbiddenPaths: ["src/", "package.json"],
  constraints: ["No dependencies", "Preserve examples"],
  acceptanceCriteria: ["Clear introduction", "Documented usage"],
  verification: ["git diff --check", "pnpm typecheck"],
};

describe("presentTaskContract", () => {
  it("prints every original field and list item in review order without changing the task", () => {
    const input = structuredClone(task);
    const before = structuredClone(input);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    presentTaskContract(input);
    expect(log.mock.calls.map(([line]) => line).join("\n")).toBe(
      `
Task Contract:
Task ID: task-001
Goal ID: goal-001
Target Repository: example

Objective:
Clarify README

Allowed Paths:
  - README.md
  - docs/intro.md

Forbidden Paths:
  - src/
  - package.json

Constraints:
  - No dependencies
  - Preserve examples

Acceptance Criteria:
  - Clear introduction
  - Documented usage

Verification Commands:
  - git diff --check
  - pnpm typecheck`
    );
    expect(input).toEqual(before);
  });

  it("explicitly displays every empty list without changing the task", () => {
    const input: TaskContract = {
      ...task,
      allowedPaths: [],
      forbiddenPaths: [],
      constraints: [],
      acceptanceCriteria: [],
      verification: [],
    };
    const before = structuredClone(input);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    presentTaskContract(input);
    const output = log.mock.calls.map(([line]) => line).join("\n");
    for (const label of [
      "Allowed Paths",
      "Forbidden Paths",
      "Constraints",
      "Acceptance Criteria",
      "Verification Commands",
    ]) {
      expect(output).toContain(`${label}:\n  None`);
    }
    expect(input).toEqual(before);
  });
});
