import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { planTask, type PlanningLimits } from "@/application/planning/index.js";
import { goalSpecSchema } from "@/contracts/goal.js";

const limits: PlanningLimits = {
  maxRounds: 4,
  maxFilesPerRequest: 5,
  maxTotalFiles: 12,
};

export async function runPlanningCli(args: string[]): Promise<number> {
  const repositoryPath = args[0];
  const objective = args[1];

  if (!repositoryPath?.trim()) {
    console.error("Error: Repository path is required.");
    return 1;
  }
  if (!objective?.trim()) {
    console.error("Error: Objective is required.");
    return 1;
  }

  try {
    const goal = goalSpecSchema.parse({
      objective,
      targetRepository: basename(resolve(repositoryPath)),
    });
    const result = await planTask({ goal, repositoryPath, limits });

    if (result.status === "failed") {
      console.error("Planning: failed");
      console.error(`Rounds: ${result.rounds}`);
      console.error(`Reason: ${result.reason}`);
      return 1;
    }

    console.log("Planning: completed");
    console.log(`Rounds: ${result.rounds}`);
    console.log("\nTask Contract:");
    console.log(JSON.stringify(result.task, null, 2));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error: Planning failed: ${message}`);
    return 1;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntryPoint) {
  runPlanningCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
