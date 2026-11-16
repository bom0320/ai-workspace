import {
  runStaffing,
  type RunStaffingOptions,
} from "@/application/staffing/index.js";
import type { PhaseAState } from "../../state.js";

export type StaffingExecutionOptions = Partial<
  Pick<RunStaffingOptions, "maxRounds" | "timeoutMs" | "agent">
>;

// Execution dependencies stay outside serializable State.
export function createRunStaffingNode(options: StaffingExecutionOptions = {}) {
  const { maxRounds = 4, timeoutMs, agent } = options;
  return async (state: PhaseAState): Promise<Partial<PhaseAState>> => {
    // 1. Require a Ready System Policy
    if (state.policyLookup?.status !== "ready")
      throw new Error("Staffing requires a ready System Policy lookup.");

    // 2. Run CEO Staffing
    // The Application preserves Human constraints and owns Proposal finalization.
    const staffingResult = await runStaffing({
      goal: state.goal,
      systemPolicy: state.policyLookup.configuration,
      maxRounds,
      timeoutMs,
      agent,
    });

    // 3. Return Staffing Result
    return { staffingResult };
  };
}
