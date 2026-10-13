import { describe, expect, it } from "vitest";

import { goalSpecSchema } from "./goal.js";

const validGoalSpec = {
  objective: "Implement Goal-to-Task Planning",
  targetRepository: "ai-workspace",
  constraints: ["Do not add new dependencies"],
};

describe("goalSpecSchema", () => {
  it("parses a valid GoalSpec", () => {
    expect(goalSpecSchema.parse(validGoalSpec)).toEqual(validGoalSpec);
  });

  it("parses a GoalSpec without constraints", () => {
    const { constraints: _constraints, ...withoutConstraints } = validGoalSpec;

    expect(goalSpecSchema.parse(withoutConstraints)).toEqual(withoutConstraints);
  });

  it.each(["objective", "targetRepository"] as const)(
    "rejects an empty %s",
    (field) => {
      expect(
        goalSpecSchema.safeParse({
          ...validGoalSpec,
          [field]: "",
        }).success,
      ).toBe(false);
    },
  );

  it("rejects an empty string in constraints", () => {
    expect(
      goalSpecSchema.safeParse({
        ...validGoalSpec,
        constraints: [""],
      }).success,
    ).toBe(false);
  });
});
