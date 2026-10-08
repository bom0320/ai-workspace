import type { TaskContract } from "@/contracts/task.js";

import type { PlanningState } from "./context.js";

export type PlanningLimits = {
  maxRounds: number;
  maxFilesPerRequest: number;
  maxTotalFiles: number;
};

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
