import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it.each([
  ["execute", "task.json", "."],
  [".", "Old positional syntax"],
])(
  "rejects retired execution arguments in the CLI process %j",
  (...args) => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli/cli.ts", ...args],
      { encoding: "utf8", timeout: 15_000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Execution requires an approved Phase B Work Item."
    );
  },
  20_000
);
