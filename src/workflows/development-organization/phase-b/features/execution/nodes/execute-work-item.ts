import type { PhaseBState } from "../../../state.js";

export type PhaseBExecutionOptions = {
  workItemId: string;
  readPaths: string[];
  timeoutMs: number;
};

export function createBlockedWorkItemExecutionNode(
  options?: PhaseBExecutionOptions
) {
  const workItemId = options?.workItemId;
  return (): Partial<PhaseBState> =>
    workItemId === undefined
      ? {}
      : {
          executionPreparationResult: {
            status: "blocked",
            workItemId,
            reason:
              "Direct Work Item execution is disabled. Phase B requires Assignment Authorization.",
          },
        };
}
