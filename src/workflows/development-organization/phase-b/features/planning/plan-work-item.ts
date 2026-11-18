import { realpathSync } from "node:fs";
import { getApprovedDecision } from "@/application/governance/index.js";
import {
  planTask,
  type PlanTaskOptions,
} from "@/application/planning/index.js";
import { resolveRepositoryRoot } from "@/infrastructure/git/index.js";
import { z } from "zod";

import {
  workDecompositionInputSchema,
  workItemSchema,
} from "@/application/work-decomposition/index.js";

export const phaseBPlanningInputSchema = workDecompositionInputSchema.extend({
  workItem: workItemSchema,
});

export type PhaseBPlanningInput = z.infer<typeof phaseBPlanningInputSchema>;

export async function planWorkItem({
  phaseB,
  repositoryPath,
  limits,
  planner,
}: Pick<PlanTaskOptions, "repositoryPath" | "limits" | "planner"> & {
  phaseB: PhaseBPlanningInput;
}) {
  const { approvedDecisionId, workItem } =
    phaseBPlanningInputSchema.parse(phaseB);
  const { context, review, snapshot } = getApprovedDecision(approvedDecisionId);
  const repositoryRoot = resolveRepositoryRoot(repositoryPath);
  if (realpathSync(repositoryRoot) !== realpathSync(snapshot.repositoryRoot)) {
    throw new Error(
      "Planning repository does not match the Approved Decision."
    );
  }
  return planTask({
    goal: context.goal,
    repositoryPath: repositoryRoot,
    limits,
    planner,
    detail: {
      objective: workItem.objective,
      deliverable: workItem.deliverable,
      direction: review.proposal.direction.text,
    },
  });
}
