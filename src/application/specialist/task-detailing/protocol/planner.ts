import { z } from "zod";

import type { GoalSpec } from "@/contracts/goal.js";
import { taskContractSchema } from "@/contracts/specialist/task-contract.js";

import type { PlanningLimits } from "../model/limits.js";
import type { PlanningState } from "../model/state.js";
import type { InspectedFile } from "@/contracts/repository/inspected-file.js";

export type PlannerContext = {
  goal: GoalSpec;
  detail: PlanningState["detail"];
  assignmentDetail: PlanningState["assignmentDetail"];
  repository: {
    name: string;
    fileTree: string[];
  };
  inspectedFiles: InspectedFile[];
  limits: PlanningLimits;
  remainingInspectionBudget: number;
};

export const taskDraftSchema = taskContractSchema.omit({
  id: true,
  goalId: true,
});

export type TaskDraft = z.infer<typeof taskDraftSchema>;

const inspectionRequestSchema = z.object({
  paths: z.array(z.string().min(1)),
});

export type InspectRequest = z.infer<typeof inspectionRequestSchema>;

export const plannerDecisionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("inspect"),
    request: inspectionRequestSchema,
  }),
  z.object({
    type: z.literal("complete"),
    task: taskDraftSchema,
  }),
]);

export type PlannerDecision = z.infer<typeof plannerDecisionSchema>;

export type Planner = (
  state: PlanningState,
  limits: PlanningLimits
) => Promise<PlannerDecision>;
