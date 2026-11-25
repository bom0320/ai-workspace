import { expect, it } from "vitest";
import { validateAssignmentProposal } from "./validate-assignment-proposal.js";

const assignment = {
  id: "analyze",
  workItemId: "review",
  specialistId: "frontend",
  repositoryAccessCeiling: "read" as const,
  objective: "Inspect behavior",
  deliverable: "Evidence-backed findings",
  dependsOn: [],
};

it("keeps Assignment dependencies within the same Work Item", () => {
  const first = assignment;
  const second = {
    ...assignment,
    id: "second",
    workItemId: "other",
    dependsOn: [first.id],
  };
  expect(
    validateAssignmentProposal(
      [first, second],
      [{ id: "review" }, { id: "other" }]
    )
  ).toBe("Assignment dependencies must belong to the same Work Item.");
});

it("requires complete selection and accepts read, write, or mixed assignments", () => {
  const selected = [{ id: "review" }, { id: "implement" }];
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
