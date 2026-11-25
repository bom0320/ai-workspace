import type { CreateAssignmentPlanInput } from "@/application/planning/index.js";
import type { PhaseBHandoff } from "../handoff/input.js";
import type { WorkDecompositionOutput } from "../work-decomposition/output.js";

export type AssignmentPlanningInput = CreateAssignmentPlanInput & {
  handoff: PhaseBHandoff;
  proposal: Extract<WorkDecompositionOutput, { status: "proposed" }>;
};
