import { integrateWorkItemResults } from "@/application/integration/work-item/index.js";
import type { PhaseBNodeInput, PhaseBNodeOutput } from "../../../data-flow.js";

export async function integrateWorkItems({
  handoff,
  assignmentPlanResult,
  workItemResults,
}: PhaseBNodeInput<"integrate-work-items">): Promise<
  PhaseBNodeOutput<"integrate-work-items">
> {
  if (assignmentPlanResult?.status !== "prepared") return {};
  const planId = assignmentPlanResult.plan.id;
  const finalResult = await integrateWorkItemResults({ handoff, planId });
  if (finalResult.status === "pending") {
    const failed = workItemResults?.find(
      (result) =>
        result.status === "failed" &&
        finalResult.missingWorkItemIds.includes(result.workItemId)
    );
    if (failed?.status === "failed")
      return {
        finalResult: { status: "failed", planId, failure: failed.failure },
      };
  }
  return { finalResult };
}
