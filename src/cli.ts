import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ZodError } from "zod";

import { loadTaskContract } from "./contracts/task-loader.js";
import { executeTask } from "./execution/task-executor.js";
import { resolveRepositoryRoot } from "./repository/repository.js";

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

  const result = executeTask(task, repositoryRoot);

  if (result.artifacts) {
    console.log(`Run Artifacts: ${result.artifacts.directory}`);
  }

  if (result.retainedWorkspace) {
    console.error(`Execution Workspace retained: ${result.retainedWorkspace}`);
  }

  if (result.evidence.workerOutput !== undefined) {
    console.log("Codex Worker: complete");
  }

  if (result.scope && !result.scope.passed) {
    console.error("Scope: failed");

    for (const path of result.scope.violations) {
      console.error(`Scope violation: ${path}`);
    }
  }

  if (result.evidence.verification) {
    if (result.evidence.verification.passed) {
      console.log("Verification: passed");
    } else {
      console.error("Verification: failed");

      for (const command of result.evidence.verification.commands.filter(
        (command) => !command.passed,
      )) {
        console.error(
          `Failed command: ${command.command} (exit code: ${command.exitCode ?? "unavailable"})`,
        );
      }
    }
  }

  for (const failure of result.failures) {
    if (
      failure.stage === "scope" ||
      (failure.stage === "verification" && result.evidence.verification)
    ) {
      continue;
    }

    const labels = {
      workspace: "Execution Workspace creation",
      worker: "Codex Worker",
      evidence: "Execution Evidence collection",
      verification: "Verification",
      cleanup: "Execution Workspace cleanup",
      preservation: "Execution result preservation",
      report: "Final execution report",
    } as const;

    console.error(`Error: ${labels[failure.stage]} failed: ${failure.message}`);
  }

  if (result.passed) {
    console.log(`Changed Paths: ${result.evidence.changedPaths?.length ?? 0}`);
    console.log(`ID: ${task.id}`);
    console.log(`Repository: ${task.targetRepository}`);
    console.log(`Objective: ${task.objective}`);
  }

  return result.passed ? 0 : 1;
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntryPoint) {
  process.exitCode = runCli(process.argv.slice(2));
}
