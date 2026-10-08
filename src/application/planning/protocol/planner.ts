import { z } from "zod";

import type { GoalSpec } from "@/contracts/goal.js";
import { taskContractSchema } from "@/contracts/task.js";

import type { PlanningState } from "../model/state.js";

import type { InspectRequest, InspectedFile } from "./inspection.js";

export type PlannerContext = {
  goal: GoalSpec;
  repository: {
    name: string;
    fileTree: string[];
    packageScripts: Record<string, string>;
    instructions?: string;
  };
  inspectedFiles: InspectedFile[];
};

export const taskDraftSchema = taskContractSchema.omit({
  id: true,
  goalId: true,
});

export type TaskDraft = z.infer<typeof taskDraftSchema>;

const inspectionRequestSchema = z.object({
  paths: z.array(z.string().min(1)),
}) satisfies z.ZodType<InspectRequest>;

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

export type Planner = (state: PlanningState) => Promise<PlannerDecision>;
