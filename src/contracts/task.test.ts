import { describe, expect, it } from "vitest";

import { taskContractSchema } from "./task.js";

const validTaskContract = {
  id: "task-001",
  goalId: "goal-001",
  objective: "Implement the TaskContract schema",
  targetRepository: "ai-workspace",
  allowedPaths: ["src/contracts/task.ts", "src/contracts/task.test.ts"],
  forbiddenPaths: ["docs/architecture.md", "README.md"],
  constraints: ["Do not add other contracts"],
  acceptanceCriteria: ["Valid contracts parse successfully"],
  verification: ["pnpm typecheck", "pnpm test"],
};

describe("taskContractSchema", () => {
  it("parses a valid TaskContract", () => {
    expect(taskContractSchema.parse(validTaskContract)).toEqual(validTaskContract);
  });

  it("rejects a missing required field", () => {
    const { objective: _objective, ...withoutObjective } = validTaskContract;

    expect(taskContractSchema.safeParse(withoutObjective).success).toBe(false);
  });

  it.each(["id", "goalId", "objective", "targetRepository"] as const)(
    "rejects an empty %s",
    (field) => {
      expect(
        taskContractSchema.safeParse({
          ...validTaskContract,
          [field]: "",
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    "allowedPaths",
    "forbiddenPaths",
    "constraints",
    "acceptanceCriteria",
    "verification",
  ] as const)("rejects an empty string in %s", (field) => {
    expect(
      taskContractSchema.safeParse({
        ...validTaskContract,
        [field]: [""],
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid field type", () => {
    expect(
      taskContractSchema.safeParse({
        ...validTaskContract,
        allowedPaths: "src/contracts/task.ts",
      }).success,
    ).toBe(false);
  });
});
