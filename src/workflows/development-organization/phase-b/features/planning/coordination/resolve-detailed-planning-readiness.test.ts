import { expect, it } from "vitest";
import type { WorkItem } from "@/application/work-decomposition/index.js";
import type { PhaseBAssignment } from "@/contracts/phase-b-assignment.js";
import { resolveDetailedPlanningReadiness } from "./resolve-detailed-planning-readiness.js";

function workItem(id: string, overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id,
    workType: "repository-modification",
    objective: "Update the repository",
    deliverable: "Patch",
    dependsOn: [],
    ...overrides,
  };
}

function worker(
  workItemId: string,
  overrides: Partial<PhaseBAssignment> = {}
): PhaseBAssignment {
  return {
    id: `worker-${workItemId}`,
    workItemId,
    specialistId: "approved",
    repositoryAccessCeiling: "write",
    objective: "Implement",
    deliverable: "Patch",
    dependsOn: [],
    ...overrides,
  };
}

it("preserves selection order and defers Work Item and Worker dependencies", () => {
  const items = [
    workItem("ready-a"),
    workItem("ready-b"),
    workItem("work-dependent", { dependsOn: ["ready-a"] }),
    workItem("worker-dependent"),
    workItem("unselected"),
  ];
  const assignments = items.map(({ id }) =>
    worker(id, id === "worker-dependent" ? { dependsOn: ["analysis"] } : {})
  );
  expect(
    resolveDetailedPlanningReadiness(
      ["ready-b", "worker-dependent", "work-dependent", "ready-a"],
      items,
      assignments
    )
  ).toEqual({
    readyWorkItemIds: ["ready-b", "ready-a"],
    deferredWorkItemIds: ["worker-dependent", "work-dependent"],
  });
});

it("excludes read-only and untyped items, and defers modification work without exactly one Worker", () => {
  expect(
    resolveDetailedPlanningReadiness(
      ["read-only", "legacy", "multiple", "missing"],
      [
        workItem("read-only", { workType: "read-only" }),
        workItem("legacy", { workType: undefined }),
        workItem("multiple"),
        workItem("missing"),
      ],
      [worker("multiple"), worker("multiple", { id: "second-worker" })]
    )
  ).toEqual({
    readyWorkItemIds: [],
    deferredWorkItemIds: ["multiple", "missing"],
  });
});
