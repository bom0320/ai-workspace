import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ZodError } from "zod";

import { resolveRepositoryRoot } from "./repository.js";
import { loadTaskContract } from "./task-loader.js";

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

  let repositoryRoot;

  try {
    repositoryRoot = resolveRepositoryRoot(repositoryPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    console.error(`Error: Repository resolution failed: ${message}`);
    return 1;
  }

  console.log("Task Contract: valid");
  console.log(`ID: ${task.id}`);
  console.log(`Repository: ${task.targetRepository}`);
  console.log(`Repository Root: ${repositoryRoot}`);
  console.log(`Objective: ${task.objective}`);

  return 0;
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntryPoint) {
  process.exitCode = runCli(process.argv.slice(2));
}
