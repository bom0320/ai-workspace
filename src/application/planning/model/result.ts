import type { TaskContract } from "@/contracts/task.js";

import type { PlanningState } from "./state.js";

export type PlanningResult =
  | {
      status: "completed";
      task: TaskContract;
      state: PlanningState;
      rounds: number;
    }
  | {
      status: "failed";
      state: PlanningState;
      rounds: number;
      reason: string;
    };
