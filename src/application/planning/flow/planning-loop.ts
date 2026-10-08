import { resolve } from "node:path";
import { ZodError } from "zod";

import type { PlanningDecision } from "../model/decision.js";
import type { PlanningLimits } from "../model/limits.js";
import type { PlanningResult } from "../model/result.js";
import type { PlanningState } from "../model/state.js";
import { finalizeTaskContract } from "./finalize-task-contract.js";
import { inspectFiles, InspectionRequestError } from "./inspect-files.js";

export type Planner = (state: PlanningState) => Promise<PlanningDecision>;

export async function runPlanningLoop({
  initialState,
  planner,
  limits,
  goalId,
  taskId,
}: {
  initialState: PlanningState;
  planner: Planner;
  limits: PlanningLimits;
  goalId: string;
  taskId: string;
}): Promise<PlanningResult> {
  let state = initialState;
  let rounds = 0;
  const fail = (reason: string): PlanningResult => ({
    status: "failed", state, rounds, reason,
  });

  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      return fail("Planning limits must be non-negative safe integers.");
    }
  }

  while (rounds < limits.maxRounds) {
    rounds += 1;
    const decision = await planner(state);

    if (decision.type === "complete") {
      try {
        const task = finalizeTaskContract({ draft: decision.task, goal: state.goal, goalId, taskId });
        return { status: "completed", task, state, rounds };
      } catch (error) {
        if (error instanceof ZodError) {
          return fail("Planner returned a task draft that could not be finalized.");
        }
        throw error;
      }
    }

    if (rounds === limits.maxRounds) {
      return fail("Planning round limit reached.");
    }
    if (decision.request.paths.length > limits.maxFilesPerRequest) {
      return fail("Inspection request exceeds maxFilesPerRequest.");
    }

    const root = state.repository.repositoryRoot;
    const seen = new Set(state.inspectedFiles.map((file) => resolve(root, file.path)));
    const paths: string[] = [];
    for (const path of decision.request.paths) {
      const absolutePath = resolve(root, path);
      if (!seen.has(absolutePath)) {
        seen.add(absolutePath);
        paths.push(path);
      }
    }

    if (paths.length === 0) {
      return fail("No new inspection context requested.");
    }
    if (state.inspectedFiles.length + paths.length > limits.maxTotalFiles) {
      return fail("Inspection request exceeds maxTotalFiles.");
    }

    try {
      const result = inspectFiles(root, { paths });
      state = { ...state, inspectedFiles: [...state.inspectedFiles, ...result.files] };
    } catch (error) {
      if (error instanceof InspectionRequestError) {
        return fail("Inspection request is invalid.");
      }
      throw error;
    }
  }

  return fail("Planning round limit reached.");
}
