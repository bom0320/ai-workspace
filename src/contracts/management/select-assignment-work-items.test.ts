import { expect, it } from "vitest";
import { selectAssignmentWorkItems } from "./select-assignment-work-items.js";

const workItems = [
  { id: "review", objective: "Review behavior" },
  { id: "implement", objective: "Implement approved direction" },
  { id: "untyped", objective: "Assess scope" },
];

it("projects the requested Work Items in decomposition order", () => {
  expect(selectAssignmentWorkItems(workItems, ["implement", "review"])).toEqual(
    workItems.slice(0, 2)
  );
  expect(selectAssignmentWorkItems(workItems, ["untyped"])).toEqual([
    workItems[2],
  ]);
});

it.each([[], ["review", "review"], ["review", "missing"]])(
  "rejects empty, duplicate, or unknown selections",
  (...ids) => {
    expect(selectAssignmentWorkItems(workItems, ids)).toBeUndefined();
  }
);
