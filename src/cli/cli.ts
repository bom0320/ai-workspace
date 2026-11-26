import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { RunDecisionInput } from "@/application/specialist/analysis/index.js";

import { runGovernanceCli } from "./commands/governance/index.js";
import { runStaffingCli } from "./commands/staffing/index.js";

import { runDecisionCommand } from "./commands/decision/index.js";
import {
  presentDecisions,
  presentComparison,
} from "./presenters/decision/index.js";
import { askDecision } from "./prompts/decision/index.js";

export async function runDecisionCli(args: string[]): Promise<number> {
  return executeDecisionInput({
    repositoryPath: args[0] ?? "",
    objective: args[1] ?? "",
    filePaths: args.slice(2),
  });
}

async function executeDecisionInput(input: RunDecisionInput): Promise<number> {
  const startedAt = performance.now();
  try {
    console.log("Decision...");
    const result = await runDecisionCommand(input);
    presentDecisions(result.snapshot, result.decisions);
    presentComparison(result.comparison);
    console.log(
      `Decision Duration: ${((performance.now() - startedAt) / 1_000).toFixed(1)}s`
    );
    return 0;
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    return 1;
  }
}

export async function runCli(args: string[]): Promise<number> {
  if (args[0] === "staffing") return runStaffingCli(args.slice(1));
  if (args[0] === "governance") return runGovernanceCli(args.slice(1));
  if (args[0] === "decision") return runDecisionCli(args.slice(1));
  try {
    if (args.length > 0) {
      console.error(
        "Error: Unsupported command. Use decision, staffing, or governance. Task Detailing and execution require an approved Phase B Assignment."
      );
      return 1;
    }
    console.log("AI Workspace\n");
    return await executeDecisionInput(await askDecision());
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    return 1;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntryPoint) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
