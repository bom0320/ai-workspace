import type { ExecutionTelemetry } from "@/application/execution/index.js";

export type HumanInteractionTiming = {
  planningDurationMs?: number;
  approvalWaitDurationMs?: number;
};

export function presentTiming(timing: HumanInteractionTiming & Partial<ExecutionTelemetry>): void {
  console.log("\nTiming\n------");
  const rows = [
    ["Planning", timing.planningDurationMs],
    ["Approval Wait", timing.approvalWaitDurationMs],
    ["Workspace", timing.workspaceDurationMs],
    ["Worker", timing.workerDurationMs],
    ["  - Setup", timing.workerSetupDurationMs],
    ["  - Codex Process", timing.codexProcessDurationMs],
    ["  - Output Processing", timing.workerOutputProcessingDurationMs],
    ["Verification", timing.verificationDurationMs],
    ["Cleanup", timing.cleanupDurationMs],
    ["Total", timing.totalDurationMs],
  ] as const;
  for (const [label, duration] of rows) {
    if (duration !== undefined) console.log(`${label}: ${(duration / 1_000).toFixed(1)}s`);
  }
}
