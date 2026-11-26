import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runGovernanceCli } from "./commands/governance/index.js";

export async function runCli(args: string[]): Promise<number> {
  if (args[0] === "governance") return runGovernanceCli(args.slice(1));
  console.error(
    "Use governance <command> for policy and approval administration. Run Development Organization phases through the Workflow API."
  );
  return 1;
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntryPoint) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
