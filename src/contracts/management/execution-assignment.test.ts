import { expect, it } from "vitest";
import { executionAssignmentSchema } from "./execution-assignment.js";

const assignment = {
  id: "analyze",
  workItemId: "review",
  specialistId: "frontend",
  repositoryAccessCeiling: "read" as const,
  objective: "Inspect behavior",
  deliverable: "Evidence-backed findings",
  dependsOn: [],
};

it("accepts read and write ceilings", () => {
  expect(executionAssignmentSchema.parse(assignment)).toEqual(assignment);
  expect(
    executionAssignmentSchema.safeParse({
      ...assignment,
      repositoryAccessCeiling: "write",
    }).success
  ).toBe(true);
});

it.each([
  { id: "" },
  { workItemId: "" },
  { dependsOn: ["other", "other"] },
  { role: "Administrator" },
  { shellExecution: true },
  { objective: " " },
  { deliverable: "" },
  { repositoryAccessCeiling: "unknown" },
  { executor: { kind: "worker", mode: "unknown" } },
])("rejects invalid fields and authority overrides %j", (override) => {
  expect(
    executionAssignmentSchema.safeParse({ ...assignment, ...override }).success
  ).toBe(false);
});
