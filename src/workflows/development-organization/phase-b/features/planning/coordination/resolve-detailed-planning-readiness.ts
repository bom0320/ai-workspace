import type { WorkItem } from "@/application/work-decomposition/index.js";
import type { PhaseBAssignment } from "@/contracts/phase-b-assignment.js";

export function resolveDetailedPlanningReadiness(
  selectedWorkItemIds: readonly string[],
  workItems: readonly WorkItem[],
  assignments: readonly PhaseBAssignment[]
) {
  const readyWorkItemIds: string[] = [];
  const deferredWorkItemIds: string[] = [];
  for (const id of selectedWorkItemIds) {
    const item = workItems.find((workItem) => workItem.id === id);
    if (item?.workType !== "repository-modification") continue;
    const workers = assignments.filter(
      ({ workItemId, repositoryAccessCeiling }) =>
        workItemId === id && repositoryAccessCeiling === "write"
    );
    if (
      !item.dependsOn.length &&
      workers.length === 1 &&
      !workers[0].dependsOn.length
    )
      readyWorkItemIds.push(id);
    else deferredWorkItemIds.push(id);
  }
  return { readyWorkItemIds, deferredWorkItemIds };
}
