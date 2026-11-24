import { expect, it } from "vitest";
import type { PhaseBState } from "../../../state.js";
import { createSelectWorkItemsNode } from "./select-work-items.js";

const state = {
  workDecompositionResult: {
    status: "proposed",
    approvedDecisionId: "decision-1",
    workItems: ["first", "second"].map((id) => ({
      id,
      objective: "Review",
      deliverable: "Findings",
      dependsOn: [],
    })),
  },
  pendingPlanningIds: ["first"],
  planningResults: [],
} satisfies Partial<PhaseBState>;

it("returns only the selected IDs, in selection order without duplicates", () => {
  expect(
    createSelectWorkItemsNode(() => ["second", "first", "second"])(state)
  ).toEqual({ selectedWorkItemIds: ["second", "first"] });
});

it("rejects IDs outside the current decomposition", () => {
  expect(() => createSelectWorkItemsNode(() => ["unknown"])(state)).toThrow(
    "Planning selection contains an unknown Work Item ID."
  );
});
