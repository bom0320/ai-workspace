import { resolve } from "node:path";
import { ZodError } from "zod";

import type { PlanningState } from "../model/context.js";
import type { InspectionRequest, PlanningDecision, TaskContractDraft } from "../model/decision.js";
import type { PlanningLimits, PlanningResult } from "../model/result.js";
import { finalizeTaskContract } from "./finalize-task-contract.js";
import { inspectFiles, InspectionRequestError } from "./inspect-files.js";

export type Planner = (state: PlanningState) => Promise<PlanningDecision>;

function hasValidLimits(limits: PlanningLimits): boolean {
  return Object.values(limits).every((value) => Number.isSafeInteger(value) && value >= 0);
}

function prepareInspection(
  state: PlanningState,
  request: InspectionRequest,
  limits: PlanningLimits,
): { paths: string[]; reason?: never } | { reason: string; paths?: never } {
  if (request.paths.length > limits.maxFilesPerRequest) {
    return { reason: "Inspection request exceeds maxFilesPerRequest." };
  }

  const root = state.repository.repositoryRoot;
  const seen = new Set(state.inspectedFiles.map((file) => resolve(root, file.path)));
  const paths: string[] = [];
  for (const path of request.paths) {
    const absolutePath = resolve(root, path);
    if (!seen.has(absolutePath)) {
      seen.add(absolutePath);
      paths.push(path);
    }
  }

  if (paths.length === 0) {
    return { reason: "No new inspection context requested." };
  }
  if (state.inspectedFiles.length + paths.length > limits.maxTotalFiles) {
    return { reason: "Inspection request exceeds maxTotalFiles." };
  }
  return { paths };
}

function inspectNewContext(state: PlanningState, paths: string[]): PlanningState {
  const result = inspectFiles(state.repository.repositoryRoot, { paths });
  return { ...state, inspectedFiles: [...state.inspectedFiles, ...result.files] };
}

function completePlanning(
  state: PlanningState,
  draft: TaskContractDraft,
  goalId: string,
  taskId: string,
  rounds: number,
): PlanningResult {
  try {
    const task = finalizeTaskContract({ draft, goal: state.goal, goalId, taskId });
    return { status: "completed", task, state, rounds };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        status: "failed", state, rounds,
        reason: "Planner returned a task draft that could not be finalized.",
      };
    }
    throw error;
  }
}

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

  if (!hasValidLimits(limits)) {
    return fail("Planning limits must be non-negative safe integers.");
  }

  while (rounds < limits.maxRounds) {
    rounds += 1;
    const decision = await planner(state);

    if (decision.type === "complete") {
      return completePlanning(state, decision.task, goalId, taskId, rounds);
    }
    if (rounds === limits.maxRounds) {
      return fail("Planning round limit reached.");
    }

    const inspection = prepareInspection(state, decision.request, limits);
    if (inspection.reason !== undefined) {
      return fail(inspection.reason);
    }

    try {
      state = inspectNewContext(state, inspection.paths);
    } catch (error) {
      if (error instanceof InspectionRequestError) {
        return fail("Inspection request is invalid.");
      }
      throw error;
    }
  }

  return fail("Planning round limit reached.");
}
