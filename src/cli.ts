import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ZodError } from "zod";

import { runCodexWorker } from "./codex-worker.js";
import {
  createExecutionWorkspace,
  removeExecutionWorkspace,
} from "./execution-workspace.js";
import { resolveRepositoryRoot } from "./repository.js";
import { loadTaskContract } from "./task-loader.js";
import { runVerification } from "./verification-runner.js";

export function runCli(args: string[]): number {
  const taskPath = args[0];
  const repositoryPath = args[1];

  if (!taskPath) {
    console.error("Error: Task file path is required.");
    return 1;
  }

  if (!repositoryPath) {
    console.error("Error: Repository path is required.");
    return 1;
  }

  let task;

  try {
    task = loadTaskContract(taskPath);
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error("Error: Task file contains malformed JSON.");
    } else if (error instanceof ZodError) {
      console.error("Error: TaskContract validation failed.");
    } else if (error instanceof Error && "code" in error) {
      console.error(`Error: Unable to read task file: ${taskPath}`);
    } else {
      console.error("Error: Unable to load TaskContract.");
    }

    return 1;
  }

  console.log("Task Contract: valid");

  let repositoryRoot;

  try {
    repositoryRoot = resolveRepositoryRoot(repositoryPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    console.error(`Error: Repository resolution failed: ${message}`);
    return 1;
  }

  console.log(`Repository Root: ${repositoryRoot}`);

  let workspaceRoot;

  try {
    workspaceRoot = createExecutionWorkspace(repositoryRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    console.error(`Error: Execution Workspace creation failed: ${message}`);
    return 1;
  }

  console.log(`Execution Workspace: ${workspaceRoot}`);
  let exitCode = 0;
  let workerPassed = true;

  try {
    try {
      runCodexWorker(task, workspaceRoot);
      console.log("Codex Worker: complete");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      console.error(`Error: Codex Worker failed: ${message}`);
      exitCode = 1;
      workerPassed = false;
    }

    if (workerPassed) {
      const verification = runVerification(task.verification, workspaceRoot);

      if (!verification.passed) {
        console.error("Verification: failed");

        for (const command of verification.commands.filter(
          (command) => !command.passed,
        )) {
          console.error(
            `Failed command: ${command.command} (exit code: ${command.exitCode ?? "unavailable"})`,
          );
        }

        exitCode = 1;
      } else {
        console.log("Verification: passed");
        console.log(`ID: ${task.id}`);
        console.log(`Repository: ${task.targetRepository}`);
        console.log(`Objective: ${task.objective}`);
      }
    }
  } finally {
    try {
      removeExecutionWorkspace(repositoryRoot, workspaceRoot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      console.error(`Error: Execution Workspace cleanup failed: ${message}`);
      exitCode = 1;
    }
  }

  return exitCode;
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntryPoint) {
  process.exitCode = runCli(process.argv.slice(2));
}
