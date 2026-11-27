import type { TaskContract } from "@/contracts/specialist/task-contract.js";
import { verifyApprovedWorkspace } from "@/services/verification/index.js";
import { addExecutionFailure, type ExecutionState } from "../../model/state.js";

export async function runApprovedVerification(
  task: TaskContract,
  state: ExecutionState,
  workspaceRoot: string,
  remaining: () => number,
  snapshot: { baseCommit: string; directory: string }
): Promise<void> {
  const startedAt = performance.now();
  try {
    state.evidence.verification = await verifyApprovedWorkspace(
      task.verification,
      workspaceRoot,
      remaining,
      snapshot
    );
  } catch (error) {
    addExecutionFailure(state, "verification", error);
    return;
  } finally {
    if (state.telemetry)
      state.telemetry.verificationDurationMs = performance.now() - startedAt;
  }

  if (!state.evidence.verification.passed) {
    state.failures.push({
      stage: "verification",
      message: "Verification failed.",
    });
  }
}
