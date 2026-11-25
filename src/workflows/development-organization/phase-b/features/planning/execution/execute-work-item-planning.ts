import type { ExecutionDelegationRequest } from "@/application/governance/index.js";
import type {
  PlanTaskOptions,
  PlanningResult,
} from "@/application/planning/index.js";
import { z } from "zod";

import {
  workDecompositionInputSchema,
  workItemSchema,
} from "@/application/work-decomposition/index.js";

export const phaseBPlanningInputSchema = workDecompositionInputSchema.extend({
  workItem: workItemSchema,
});

export type PhaseBPlanningInput = z.infer<typeof phaseBPlanningInputSchema>;

export async function executeWorkItemPlanning(
  _options: Pick<PlanTaskOptions, "repositoryPath" | "limits" | "planner"> & {
    phaseB: PhaseBPlanningInput;
    executionDelegationGrant?: ExecutionDelegationRequest;
    predecessorResults?: string;
  }
): Promise<PlanningResult> {
  throw new Error(
    "Phase B Detailed Planning requires Assignment-bound authorization."
  );
}
