import { isAbsolute, relative, resolve, sep } from "node:path";
import { ZodError } from "zod";

import { taskContractSchema } from "@/contracts/task.js";

import type { PlanningDecision } from "../model/decision.js";
import type { PlanningLimits } from "../model/limits.js";
import type { PlanningResult } from "../model/result.js";
import type { PlanningState } from "../model/state.js";
import { inspectFiles } from "./inspect-files.js";

export type Planner = (state: PlanningState) => Promise<PlanningDecision>;

export async function runPlanningLoop({
  initialState,
  planner,
  limits,
}: {
  initialState: PlanningState;
  planner: Planner;
  limits: PlanningLimits;
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
        const task = taskContractSchema.parse(decision.task);
        return { status: "completed", task, state, rounds };
      } catch (error) {
        if (error instanceof ZodError) {
          return fail("Planner returned an invalid TaskContract.");
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
      const relativePath = relative(root, absolutePath);
      if (
        isAbsolute(path) || relativePath === ".." ||
        relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath) ||
        path.split(sep).some((part) => [".git", "node_modules", ".ai-workspace"].includes(part))
      ) {
        return fail("Inspection request contains an unsafe path.");
      }
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

    const result = inspectFiles(root, { paths });
    state = { ...state, inspectedFiles: [...state.inspectedFiles, ...result.files] };
  }

  return fail("Planning round limit reached.");
}
