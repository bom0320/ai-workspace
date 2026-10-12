import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { PlanningResult } from "@/application/planning/index.js";
import { runPlanCommand } from "./commands/plan.js";
import { runExecuteCommand, runExecutionCli } from "./commands/execute.js";
import { approveTask } from "./prompts/approve-task.js";
import { askGoal } from "./prompts/ask-goal.js";
import { presentTaskContract } from "./presenters/task-contract.js";

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
  try {
    const result = await runPlanCommand({ repositoryPath: args[0] ?? "", objective: args[1] ?? "" });
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

export async function runCli(args: string[]): Promise<number> {
  if (args[0] === "plan") return runPlanningCli(args.slice(1));
  try {
    if (args[0] === "execute") return await runExecutionCli(args.slice(1));
    const input = args.length === 0
      ? await askGoal()
      : { repositoryPath: args[0] ?? "", objective: args[1] ?? "" };
    console.log("Planning...");
    const result = await runPlanCommand(input);
    if (!reportPlanning(result) || result.status !== "completed") return 1;
    presentTaskContract(result.task);
    const approved = await approveTask();
    if (!approved) {
      console.log("Task: rejected. Execution was not started.");
      return 1;
    }
    console.log("Execution...");
    return await runExecuteCommand(result.task, result.state.repository.repositoryRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error: ${message}`);
    return 1;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntryPoint) {
  runCli(process.argv.slice(2)).then((exitCode) => { process.exitCode = exitCode; });
}
