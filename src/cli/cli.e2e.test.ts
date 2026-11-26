import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it.each([
  ["plan", ".", "Clarify README"],
  ["execute", "task.json", "."],
  [".", "Old positional syntax"],
])(
  "rejects retired commands or positional arguments in the CLI process %j",
  (...args) => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli/cli.ts", ...args],
      { encoding: "utf8", timeout: 15_000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Task Detailing and execution require an approved Phase B Assignment."
    );
  },
  20_000
);
