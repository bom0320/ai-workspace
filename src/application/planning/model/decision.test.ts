import { describe, expect, it } from "vitest";

import { planningDecisionSchema } from "./decision.js";

const validTask = {
  id: "task-001",
  goalId: "goal-001",
  objective: "Implement the goal",
  targetRepository: "example",
  allowedPaths: ["src/cli.ts"],
  forbiddenPaths: [],
  constraints: [],
  acceptanceCriteria: ["The goal is implemented"],
  verification: ["pnpm test"],
};

describe("planningDecisionSchema", () => {
  it("parses a valid inspect decision", () => {
    const decision = { type: "inspect", request: { paths: ["src/cli.ts"] } };
    expect(planningDecisionSchema.parse(decision)).toEqual(decision);
  });

  it("preserves empty inspection requests as valid", () => {
    const decision = { type: "inspect", request: { paths: [] } };
    expect(planningDecisionSchema.parse(decision)).toEqual(decision);
  });

  it("parses a valid complete decision", () => {
    const decision = { type: "complete", task: validTask };
    expect(planningDecisionSchema.parse(decision)).toEqual(decision);
  });

  it("rejects an unknown decision type", () => {
    expect(planningDecisionSchema.safeParse({ type: "unknown" }).success).toBe(false);
  });

  it("rejects an empty string in inspection paths", () => {
    expect(planningDecisionSchema.safeParse({
      type: "inspect", request: { paths: [""] },
    }).success).toBe(false);
  });

  it("rejects an invalid completed TaskContract", () => {
    expect(planningDecisionSchema.safeParse({
      type: "complete", task: { ...validTask, id: "" },
    }).success).toBe(false);
  });
});
