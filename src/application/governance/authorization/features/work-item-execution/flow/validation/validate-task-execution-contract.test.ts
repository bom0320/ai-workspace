import { expect, it } from "vitest";
import { validateTaskExecutionContract } from "./validate-task-execution-contract.js";

const command = "git diff --check";
const task = {
  allowedPaths: ["docs/README.md"],
  forbiddenPaths: ["src/index.ts"],
  verification: [command],
};
const bounds = {
  readScopes: [{ kind: "directory" as const, path: "docs-other" }],
  writeScopes: [{ kind: "directory" as const, path: "docs" }],
  shellCommands: ["git diff --check" as const],
  budget: { maxExecutions: 1, maxTimeoutMs: 1000 },
};

it("accepts exact files and directory descendants within the bounds", () => {
  const expected = { writePaths: task.allowedPaths, shellCommands: [command] };
  expect(validateTaskExecutionContract(task, bounds)).toEqual(expected);
  expect(
    validateTaskExecutionContract(task, {
      readPaths: [],
      writePaths: task.allowedPaths,
      shellCommands: bounds.shellCommands,
      budget: bounds.budget,
    })
  ).toEqual(expected);
});

it.each([
  { allowedPaths: ["docs-other/README.md"] },
  { allowedPaths: ["docs/../README.md"] },
  { allowedPaths: ["/docs/README.md"] },
  { allowedPaths: ["docs/.git/config"] },
  { allowedPaths: ["docs/*.md"] },
  { allowedPaths: [] },
  { allowedPaths: ["docs/README.md", "docs/README.md"] },
  { forbiddenPaths: ["docs/README.md"] },
  { forbiddenPaths: ["../README.md"] },
  { forbiddenPaths: ["src/index.ts", "src/index.ts"] },
  { verification: ["pnpm test"] },
  { verification: [command, command] },
])("rejects task contract changes %j", (change) => {
  expect(() =>
    validateTaskExecutionContract({ ...task, ...change }, bounds)
  ).toThrow();
});

it("requires explicit bounds for verification and supports omitting it", () => {
  const withoutShell = { ...bounds, shellCommands: [] };
  expect(() => validateTaskExecutionContract(task, withoutShell)).toThrow();
  expect(
    validateTaskExecutionContract({ ...task, verification: [] }, withoutShell)
  ).toEqual({ writePaths: task.allowedPaths, shellCommands: [] });
});

it("accepts an explicit read-only contract without granting writes or commands", () => {
  const readOnlyTask = { ...task, allowedPaths: [], verification: [] };
  expect(
    validateTaskExecutionContract(readOnlyTask, bounds, "read-only")
  ).toEqual({
    writePaths: [],
    shellCommands: [],
  });
  expect(() => validateTaskExecutionContract(readOnlyTask, bounds)).toThrow();
});

it.each([{ allowedPaths: task.allowedPaths }, { verification: [command] }])(
  "rejects write or shell capability on read-only work %j",
  (extra) => {
    expect(() =>
      validateTaskExecutionContract(
        { ...task, allowedPaths: [], verification: [], ...extra },
        bounds,
        "read-only"
      )
    ).toThrow();
  }
);
