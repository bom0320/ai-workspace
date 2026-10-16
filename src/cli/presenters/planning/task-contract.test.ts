import { afterEach, describe, expect, it, vi } from "vitest";

import type { TaskContract } from "@/contracts/task.js";

import { presentTaskContract } from "./task-contract.js";

afterEach(() => { vi.restoreAllMocks(); });

describe("presentTaskContract", () => {
  it("prints every task field without changing the task or asking for input", () => {
    const task: TaskContract = {
      id: "task-001", goalId: "goal-001", objective: "Clarify README",
      targetRepository: "example", allowedPaths: ["README.md"], forbiddenPaths: ["src/"],
      constraints: ["No dependencies"], acceptanceCriteria: ["Clear introduction"],
      verification: ["git diff --check"],
    };
    const before = structuredClone(task);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    presentTaskContract(task);
    expect(log).toHaveBeenCalledWith("\nTask Contract:");
    expect(log).toHaveBeenCalledWith(JSON.stringify(task, null, 2));
    expect(log).toHaveBeenCalledTimes(2);
    expect(task).toEqual(before);
  });
});
