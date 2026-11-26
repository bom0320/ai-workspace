import type { TaskContract } from "@/contracts/specialist/task-contract.js";
import { runCodexWorker } from "../../worker/codex-worker.js";
import { addExecutionFailure, type ExecutionState } from "../../model/state.js";

export async function runCodexWorkerStage(
  task: TaskContract,
  state: ExecutionState,
  workspaceRoot: string,
  remaining: () => number
): Promise<boolean> {
  const startedAt = performance.now();
  try {
    state.evidence.workerOutput = await runCodexWorker(
      task,
      workspaceRoot,
      remaining(),
      state.telemetry
    );

    return true;
  } catch (error) {
    addExecutionFailure(state, "worker", error);
    return false;
  } finally {
    if (state.telemetry)
      state.telemetry.workerDurationMs = performance.now() - startedAt;
  }
}
