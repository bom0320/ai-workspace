import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import type { GoalSpec } from "@/contracts/goal.js";
import { taskContractSchema } from "@/contracts/task.js";

import type { TaskContractDraft } from "../model/task-draft.js";
import { finalizeTaskContract } from "./finalize-task-contract.js";

const goal: GoalSpec = {
  objective: "Clarify the project description",
  targetRepository: "human-repository",
  constraints: ["No new dependencies", "Keep changes scoped", "No new dependencies"],
};
const draft: TaskContractDraft = {
  objective: "Clarify the introduction in README.md",
  targetRepository: "ai-repository",
  allowedPaths: ["README.md"],
  forbiddenPaths: ["package.json"],
  constraints: ["Keep changes scoped", "README.md only", "README.md only"],
  acceptanceCriteria: ["The introduction is clearer"],
  verification: ["git diff --check"],
};
const ids = { taskId: "task-harness", goalId: "goal-harness" };

describe("finalizeTaskContract", () => {
  it("injects Harness identifiers and validates the final TaskContract", () => {
    const task = finalizeTaskContract({ draft, goal, ...ids });
    expect(task.id).toBe(ids.taskId);
    expect(task.goalId).toBe(ids.goalId);
    expect(taskContractSchema.parse(task)).toEqual(task);
    expect(task.objective).toBe(draft.objective);
    expect(task.allowedPaths).toEqual(draft.allowedPaths);
    expect(task.forbiddenPaths).toEqual(draft.forbiddenPaths);
    expect(task.acceptanceCriteria).toEqual(draft.acceptanceCriteria);
    expect(task.verification).toEqual(draft.verification);
  });

  it("preserves Human constraints before Draft constraints with stable deduplication", () => {
    expect(finalizeTaskContract({ draft, goal, ...ids }).constraints).toEqual([
      "No new dependencies", "Keep changes scoped", "README.md only",
    ]);
  });

  it("preserves Human constraints even when the Draft omits all of them", () => {
    expect(finalizeTaskContract({ draft: { ...draft, constraints: [] }, goal, ...ids }).constraints)
      .toEqual(["No new dependencies", "Keep changes scoped"]);
  });

  it("uses only Draft constraints when the Goal has no constraints", () => {
    const { constraints: _constraints, ...withoutConstraints } = goal;
    expect(finalizeTaskContract({ draft, goal: withoutConstraints, ...ids }).constraints)
      .toEqual(["Keep changes scoped", "README.md only"]);
  });

  it("uses the Human repository even when the Draft requests a different repository", () => {
    expect(finalizeTaskContract({ draft, goal, ...ids }).targetRepository).toBe(goal.targetRepository);
  });

  it("does not mutate either input", () => {
    const goalBefore = structuredClone(goal);
    const draftBefore = structuredClone(draft);
    const task = finalizeTaskContract({ draft, goal, ...ids });
    expect(goal).toEqual(goalBefore);
    expect(draft).toEqual(draftBefore);
    expect(task.constraints).not.toBe(goal.constraints);
    expect(task.constraints).not.toBe(draft.constraints);
  });

  it.each(["taskId", "goalId"] as const)("rejects an empty Harness %s", (field) => {
    expect(() => finalizeTaskContract({ draft, goal, ...ids, [field]: "" })).toThrow(ZodError);
  });

  it("rejects an empty Draft objective", () => {
    expect(() => finalizeTaskContract({ draft: { ...draft, objective: "" }, goal, ...ids })).toThrow(ZodError);
  });
});
