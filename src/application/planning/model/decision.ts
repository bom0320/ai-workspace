import type { TaskContract } from "@/contracts/task.js";

import type { InspectionRequest } from "./inspection.js";

export type PlanningDecision =
  | {
      type: "inspect";
      request: InspectionRequest;
    }
  | {
      type: "complete";
      task: TaskContract;
    };
