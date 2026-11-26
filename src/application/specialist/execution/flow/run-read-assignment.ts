import { analyzeAssignment } from "@/application/specialist/analysis/index.js";
import {
  AssignmentExecutionError,
  type AssignmentReadSession,
} from "@/application/governance/index.js";

export async function runReadAssignment(
  readSession: AssignmentReadSession,
  setFailureStage: (stage: "execution" | "handoff") => void
) {
  const timeoutMs = readSession.deadlineMs - Date.now();
  if (timeoutMs < 1) throw new AssignmentExecutionError("claim");
  setFailureStage("execution");
  const decision = await analyzeAssignment(
    readSession.specialist,
    readSession.context,
    readSession.authority,
    { timeoutMs }
  );
  setFailureStage("handoff");
  return {
    status: "read-completed" as const,
    ...readSession.recordResult(decision),
  };
}
