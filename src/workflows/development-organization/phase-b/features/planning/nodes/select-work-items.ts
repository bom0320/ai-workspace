import type { WorkItem } from "@/application/work-decomposition/index.js";
import type { PhaseBState } from "../../../state.js";

export type SelectWorkItemIds = (
  workItems: readonly WorkItem[]
) => readonly string[];

export function createSelectWorkItemsNode(
  selectWorkItemIds: SelectWorkItemIds | undefined
) {
  return (state: Pick<PhaseBState, "workDecompositionResult">) => {
    const proposal = state.workDecompositionResult;
    if (proposal?.status !== "proposed" || !selectWorkItemIds) return {};
    const validIds = new Set(proposal.workItems.map(({ id }) => id));
    const selectedIds = selectWorkItemIds(structuredClone(proposal.workItems));
    if (
      !Array.isArray(selectedIds) ||
      [...selectedIds].some((id) => !validIds.has(id))
    ) {
      throw new Error("Planning selection contains an unknown Work Item ID.");
    }
    return { selectedWorkItemIds: [...new Set(selectedIds)] };
  };
}
