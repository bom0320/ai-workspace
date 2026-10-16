import { normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { RunDecisionInput } from "@/application/decision/index.js";
import type { PlanningResult } from "@/application/planning/index.js";
import { runPlanCommand } from "./commands/plan/plan.js";
import { runDecisionCommand } from "./commands/decision/decision.js";
import { presentDecisions } from "./presenters/decisions.js";
import { presentComparison } from "./presenters/comparison.js";
import { runExecuteCommand, runExecutionCli } from "./commands/execute/execute.js";
import { approveTask } from "./prompts/approve-task.js";
import { askGoal, type GoalInput } from "./prompts/ask-goal.js";
import { askDecision } from "./prompts/ask-decision.js";
import { askExecution } from "./prompts/ask-execution.js";
import { selectWorkflow } from "./prompts/select-workflow.js";
import { presentTaskContract } from "./presenters/task-contract.js";
import { presentTiming, type HumanInteractionTiming } from "./presenters/timing.js";

function reportPlanning(result: PlanningResult): boolean {
  if (result.status === "failed") {
    console.error("Planning: failed");
    console.error(`Rounds: ${result.rounds}`);
    console.error(`Reason: ${result.reason}`);
    return false;
  }
  console.log("Planning: completed");
  console.log(`Rounds: ${result.rounds}`);
  return true;
}

export async function runPlanningCli(args: string[]): Promise<number> {
  return executePlanningInput({ repositoryPath: args[0] ?? "", objective: args[1] ?? "" });
}

async function executePlanningInput(input: GoalInput): Promise<number> {
  const startedAt = performance.now();
  try {
    const result = await runPlanCommand(input);
    console.log(`Planning Duration: ${((performance.now() - startedAt) / 1_000).toFixed(1)}s`);
    if (!reportPlanning(result) || result.status !== "completed") return 1;
    presentTaskContract(result.task);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const inputError = message === "Repository path is required." || message === "Objective is required.";
    console.error(inputError ? `Error: ${message}` : `Error: Planning failed: ${message}`);
    return 1;
  }
}

export async function runDecisionCli(args: string[]): Promise<number> {
  return executeDecisionInput({
    repositoryPath: args[0] ?? "", objective: args[1] ?? "", filePaths: args.slice(2),
  });
}

async function executeDecisionInput(input: RunDecisionInput): Promise<number> {
  const startedAt = performance.now();
  try {
    console.log("Decision...");
    const result = await runDecisionCommand(input);
    presentDecisions(result.snapshot, result.decisions);
    presentComparison(result.comparison);
    console.log(`Decision Duration: ${((performance.now() - startedAt) / 1_000).toFixed(1)}s`);
    return 0;
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    return 1;
  }
}

export async function runCli(args: string[]): Promise<number> {
  if (args[0] === "decision") return runDecisionCli(args.slice(1));
  if (args[0] === "plan") return runPlanningCli(args.slice(1));
  try {
    if (args[0] === "execute") return await runExecutionCli(args.slice(1));
    if (args.length > 0) {
      return await runPlanAndExecute({ repositoryPath: args[0] ?? "", objective: args[1] ?? "" });
    }
    const workflow = await selectWorkflow();
    switch (workflow) {
      case "plan-execute": return await runPlanAndExecute(await askGoal());
      case "plan": return await executePlanningInput(await askGoal());
      case "decision": return await executeDecisionInput(await askDecision());
      case "execute": {
        const input = await askExecution();
        return await runExecutionCli([input.taskPath, input.repositoryPath]);
      }
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    return 1;
  }
}

async function runPlanAndExecute(input: GoalInput): Promise<number> {
  let startedAt: number | undefined;
  const timing: HumanInteractionTiming = {};
  try {
    startedAt = performance.now();
    console.log("Planning...");
    const result = await runPlanCommand(input);
    timing.planningDurationMs = performance.now() - startedAt;
    const completed = reportPlanning(result);
    console.log(`Planning Duration: ${(timing.planningDurationMs / 1_000).toFixed(1)}s`);
    if (!completed || result.status !== "completed") {
      presentTiming({ ...timing, totalDurationMs: performance.now() - startedAt });
      return 1;
    }
    const approvalStartedAt = performance.now();
    presentTaskContract(result.task);
    const approved = await approveTask();
    timing.approvalWaitDurationMs = performance.now() - approvalStartedAt;
    if (!approved) {
      console.log("Task: rejected. Execution was not started.");
      presentTiming({ ...timing, totalDurationMs: performance.now() - startedAt });
      return 1;
    }
    console.log("Execution...");
    const allowedPaths = new Set(result.task.allowedPaths.map((path) => normalize(path)));
    const workerContext = {
      inspectedFiles: result.state.inspectedFiles.filter((file) => allowedPaths.has(normalize(file.path))),
    };
    return await runExecuteCommand(result.task, result.state.repository.repositoryRoot, { ...timing, startedAt }, workerContext);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error: ${message}`);
    if (startedAt !== undefined) presentTiming({ ...timing, totalDurationMs: performance.now() - startedAt });
    return 1;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntryPoint) {
  runCli(process.argv.slice(2)).then((exitCode) => { process.exitCode = exitCode; });
}
