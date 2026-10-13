import { describe, expect, it } from "vitest";

import { plannerDecisionSchema, taskDraftSchema } from "./planner.js";

const validTask = {
  objective: "Implement the goal",
  targetRepository: "example",
  allowedPaths: ["src/cli.ts"],
  forbiddenPaths: [],
  constraints: [],
  acceptanceCriteria: ["The goal is implemented"],
  verification: ["pnpm test"],
};

describe("plannerDecisionSchema", () => {
  it("accepts a Draft without id or goalId", () => {
    expect(taskDraftSchema.parse(validTask)).toEqual(validTask);
    expect(validTask).not.toHaveProperty("id");
    expect(validTask).not.toHaveProperty("goalId");
  });

  it("strips supplied identifiers consistently with the existing Zod object policy", () => {
    const rawTask = { ...validTask, id: "ai-id", goalId: "ai-goal" };
    expect(taskDraftSchema.parse(rawTask)).toEqual(validTask);
    expect(plannerDecisionSchema.parse({ type: "complete", task: rawTask }))
      .toEqual({ type: "complete", task: validTask });
  });

  it.each(["objective", "targetRepository"] as const)("rejects an empty Draft %s", (field) => {
    expect(taskDraftSchema.safeParse({ ...validTask, [field]: "" }).success).toBe(false);
  });
  it("parses a valid inspect decision", () => {
    const decision = { type: "inspect", request: { paths: ["src/cli.ts"] } };
    expect(plannerDecisionSchema.parse(decision)).toEqual(decision);
  });

  it("preserves empty inspection requests as valid", () => {
    const decision = { type: "inspect", request: { paths: [] } };
    expect(plannerDecisionSchema.parse(decision)).toEqual(decision);
  });

  it("parses a valid complete decision", () => {
    const decision = { type: "complete", task: validTask };
    expect(plannerDecisionSchema.parse(decision)).toEqual(decision);
  });

  it("rejects an unknown decision type", () => {
    expect(plannerDecisionSchema.safeParse({ type: "unknown" }).success).toBe(false);
  });

  it("rejects an empty string in inspection paths", () => {
    expect(plannerDecisionSchema.safeParse({
      type: "inspect", request: { paths: [""] },
    }).success).toBe(false);
  });

  it("rejects an invalid completed TaskDraft", () => {
    expect(plannerDecisionSchema.safeParse({
      type: "complete", task: { ...validTask, objective: "" },
    }).success).toBe(false);
  });
});
