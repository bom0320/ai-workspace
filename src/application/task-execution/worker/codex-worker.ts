import type { TaskContract } from "@/contracts/task.js";
import { runCommand } from "@/infrastructure/process/index.js";

import type { ExecutionTelemetry } from "../model/result.js";

export function createCodexWorkerPrompt(task: TaskContract): string {
  return [
    "Complete the following task within the provided repository workspace.",
    "",
    "The Harness will execute the TaskContract verification commands after you finish.",
    "Do not run the listed verification commands yourself.",
    "Do not run full typecheck, test, build, or diff-check commands unless they are strictly required to diagnose a concrete implementation problem.",
    "Focus on inspecting only the files needed for the task, making the requested changes, and returning a concise summary.",
    "",
    "Objective:",
    task.objective,
    "",
    ...(task.implementationPlan
      ? [
          "Background:",
          task.implementationPlan.background,
          "",
          "Current State:",
          task.implementationPlan.currentState,
          "",
          "Target Design:",
          task.implementationPlan.targetDesign,
          "",
          "Implementation Plan:",
          ...task.implementationPlan.steps.flatMap(
            ({ title, targetPaths, instructions }, index) => [
              `Step ${index + 1}. ${title}`,
              "Target Paths:",
              ...targetPaths.map((path) => `- ${path}`),
              ...(targetPaths.length ? [] : ["- (none)"]),
              "Instructions:",
              ...instructions.map((instruction) => `- ${instruction}`),
            ]
          ),
          "",
        ]
      : task.implementationSteps
        ? [
            "Implementation Steps:",
            ...task.implementationSteps.map(
              (step, index) => `${index + 1}. ${step}`
            ),
            "",
          ]
        : []),
    "Allowed paths:",
    task.allowedPaths.map((path) => `- ${path}`).join("\n") || "- (none)",
    "",
    "Forbidden paths:",
    task.forbiddenPaths.map((path) => `- ${path}`).join("\n") || "- (none)",
    "",
    "Constraints:",
    task.constraints.map((constraint) => `- ${constraint}`).join("\n") ||
      "- (none)",
    "",
    "Acceptance criteria:",
    task.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n") ||
      "- (none)",
    "",
    "Verification:",
    task.verification.map((command) => `- ${command}`).join("\n") || "- (none)",
  ].join("\n");
}

export async function runCodexWorker(
  task: TaskContract,
  workspaceRoot: string,
  timeoutMs: number,
  telemetry?: Pick<
    ExecutionTelemetry,
    | "workerSetupDurationMs"
    | "codexProcessDurationMs"
    | "workerOutputProcessingDurationMs"
  >
): Promise<string> {
  const setupStartedAt = performance.now();
  const prompt = createCodexWorkerPrompt(task);
  const processCallStartedAt = performance.now();
  if (telemetry)
    telemetry.workerSetupDurationMs = processCallStartedAt - setupStartedAt;
  const result = await runCommand(
    "codex",
    [
      "exec",
      "--sandbox",
      "workspace-write",
      "--ignore-user-config",
      "--ignore-rules",
      "--strict-config",
      "--ephemeral",
      "-c",
      'approval_policy="never"',
      "-c",
      'web_search="disabled"',
      "-c",
      "sandbox_workspace_write={network_access=false,exclude_tmpdir_env_var=true,exclude_slash_tmp=true}",
      "-c",
      `projects.${JSON.stringify(workspaceRoot)}.trust_level="untrusted"`,
      "-c",
      "features={hooks=false,apps=false,plugins=false,browser_use=false,computer_use=false,multi_agent=false,multi_agent_v2=false,memories=false}",
      prompt,
    ],
    { cwd: workspaceRoot, timeoutMs }
  );

  if (telemetry)
    telemetry.codexProcessDurationMs =
      result.processDurationMs ?? performance.now() - processCallStartedAt;
  const outputStartedAt = performance.now();
  try {
    if (result.timedOut) {
      const error = new Error(`Codex worker timed out after ${timeoutMs} ms.`);
      throw new Error(`Failed to run Codex worker: ${error.message}`, {
        cause: error,
      });
    }

    if (result.error || result.exitCode !== 0) {
      const detail =
        result.stderr.trim() ||
        result.error?.message ||
        `Codex exited with code ${result.exitCode ?? "unavailable"}.`;
      const error = result.error ?? new Error(detail);
      throw new Error(`Failed to run Codex worker: ${detail}`, {
        cause: error,
      });
    }

    return result.stdout;
  } finally {
    if (telemetry)
      telemetry.workerOutputProcessingDurationMs =
        performance.now() - outputStartedAt;
  }
}
