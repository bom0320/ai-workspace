import { expect, it } from "vitest";
import {
  phaseBAssignmentSchema,
  validateAssignmentProposal,
} from "./phase-b-assignment.js";

const assignment = {
  id: "analyze",
  workItemId: "review",
  executor: { kind: "specialist", specialistId: "frontend" },
  objective: "Inspect behavior",
  deliverable: "Evidence-backed findings",
  dependsOn: [],
};

it("accepts the two supported executor contracts", () => {
  expect(phaseBAssignmentSchema.parse(assignment)).toEqual(assignment);
  expect(
    phaseBAssignmentSchema.safeParse({
      ...assignment,
      executor: { kind: "worker", mode: "codex-worktree" },
    }).success
  ).toBe(true);
});

it.each([
  { id: "" },
  { workItemId: "" },
  { dependsOn: ["other", "other"] },
  { role: "Administrator" },
  { executor: { ...assignment.executor, shellExecution: true } },
  { executor: { kind: "worker", mode: "unknown" } },
])("rejects invalid fields and authority overrides %j", (override) => {
  expect(
    phaseBAssignmentSchema.safeParse({ ...assignment, ...override }).success
  ).toBe(false);
});

it("keeps Assignment dependencies within the same Work Item", () => {
  const first = phaseBAssignmentSchema.parse(assignment);
  const second = phaseBAssignmentSchema.parse({
    ...assignment,
    id: "second",
    workItemId: "other",
    dependsOn: [first.id],
  });
  expect(
    validateAssignmentProposal(
      [first, second],
      [
        { id: "review", workType: "read-only" },
        { id: "other", workType: "repository-modification" },
      ]
    )
  ).toBe("Assignment dependencies must belong to the same Work Item.");
});
