import { expect, it } from "vitest";
import { phaseBAssignmentSchema } from "./phase-b-assignment.js";

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
  expect(phaseBAssignmentSchema.parse(assignment)).toEqual(assignment);
  expect(
    phaseBAssignmentSchema.safeParse({
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
    phaseBAssignmentSchema.safeParse({ ...assignment, ...override }).success
  ).toBe(false);
});
