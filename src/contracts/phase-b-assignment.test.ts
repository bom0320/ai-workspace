import { expect, it } from "vitest";
import {
  phaseBAssignmentSchema,
  validateAssignmentProposal,
  selectAssignmentWorkItems,
} from "./phase-b-assignment.js";

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
      [{ id: "review" }, { id: "other" }]
    )
  ).toBe("Assignment dependencies must belong to the same Work Item.");
});

it("requires complete selection and accepts read, write, or mixed assignments", () => {
  const workItems = [{ id: "review" }, { id: "implement" }, { id: "untyped" }];
  expect(
    selectAssignmentWorkItems(workItems, ["review", "review"])
  ).toBeUndefined();
  expect(
    selectAssignmentWorkItems(workItems, ["review", "missing"])
  ).toBeUndefined();
  expect(selectAssignmentWorkItems(workItems, ["untyped"])).toEqual([
    { id: "untyped" },
  ]);
  const selected = selectAssignmentWorkItems(workItems, [
    "review",
    "implement",
  ])!;
  const writer = {
    ...assignment,
    id: "write",
    workItemId: "implement",
    repositoryAccessCeiling: "write" as const,
  };
  expect(validateAssignmentProposal([assignment], selected)).toMatch(
    /Every selected/
  );
  expect(
    validateAssignmentProposal(
      [assignment, { ...writer, repositoryAccessCeiling: "read" }],
      selected
    )
  ).toBeUndefined();
  expect(
    validateAssignmentProposal(
      [
        assignment,
        writer,
        { ...writer, id: "second-write", dependsOn: [writer.id] },
        { ...writer, id: "second-read", repositoryAccessCeiling: "read" },
      ],
      selected
    )
  ).toBeUndefined();
  expect(
    validateAssignmentProposal([assignment, writer], selected, {
      specialistIds: ["frontend"],
      repositoryAccessCeilings: ["read"],
    })
  ).toMatch(/access ceiling/);
});

it.each([["read"], ["write"], ["read", "write"]] as const)(
  "accepts a Work Item with ceilings %j",
  (...ceilings) => {
    expect(
      validateAssignmentProposal(
        ceilings.map((repositoryAccessCeiling, index) => ({
          ...assignment,
          id: `assignment-${index}`,
          repositoryAccessCeiling,
        })),
        [{ id: assignment.workItemId }]
      )
    ).toBeUndefined();
  }
);
