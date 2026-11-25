import {
  createAssignmentPlan,
  type AssignmentPlanAgent,
} from "@/application/planning/index.js";
import type { PhaseBNodeInput, PhaseBNodeOutput } from "../../../data-flow.js";

export function createAssignSpecialistsNode(agent?: AssignmentPlanAgent) {
  return async (
    state: PhaseBNodeInput<"assign-specialists">
  ): Promise<PhaseBNodeOutput<"assign-specialists">> => {
    const {
      handoff,
      handoffResult,
      workDecompositionResult,
      selectedWorkItemIds,
    } = state;
    if (
      !agent ||
      handoffResult?.status !== "accepted" ||
      workDecompositionResult?.status !== "proposed" ||
      !selectedWorkItemIds?.length
    )
      return {};

    const input = {
      handoff,
      proposal: workDecompositionResult,
      selectedWorkItemIds,
    };
    const assignmentPlanResult = await createAssignmentPlan(input, agent);
    return { assignmentPlanResult };
  };
}
