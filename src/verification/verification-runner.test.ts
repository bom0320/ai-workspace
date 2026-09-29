import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runVerification } from "./verification-runner.js";

const temporaryDirectories: string[] = [];

function nodeCommand(script: string): string {
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "ai-workspace-verification-"));

  temporaryDirectories.push(directory);

  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

describe("runVerification", () => {
  it("records a successful command", () => {
    const command = nodeCommand("process.stdout.write('success')");
    const result = runVerification([command], process.cwd());

    expect(result).toEqual({
      passed: true,
      commands: [
        {
          command,
          passed: true,
          exitCode: 0,
          stdout: "success",
          stderr: "",
        },
      ],
    });
  });

  it("records a failed command and preserves stdout and stderr", () => {
    const command = nodeCommand(
      "process.stdout.write('partial output'); " +
        "process.stderr.write('failure details'); process.exit(3)",
    );
    const result = runVerification([command], process.cwd());

    expect(result.commands[0]).toEqual({
      command,
      passed: false,
      exitCode: 3,
      stdout: "partial output",
      stderr: "failure details",
    });
  });

  it("fails the overall result when any command fails", () => {
    const result = runVerification(
      [
        nodeCommand("process.exit(0)"),
        nodeCommand("process.exit(2)"),
        nodeCommand("process.exit(0)"),
      ],
      process.cwd(),
    );

    expect(result.passed).toBe(false);
    expect(result.commands.map((command) => command.passed)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it("uses the execution workspace as the command cwd", () => {
    const workspaceRoot = createTemporaryDirectory();
    const result = runVerification(
      [nodeCommand("process.stdout.write(process.cwd())")],
      workspaceRoot,
    );

    expect(result.commands[0]?.stdout).toBe(realpathSync(workspaceRoot));
  });

  it("records a command that cannot be found as a failure", () => {
    const result = runVerification(
      ["ai-workspace-command-that-does-not-exist"],
      process.cwd(),
    );
    const command = result.commands[0];

    expect(command?.passed).toBe(false);
    expect(command?.exitCode).not.toBe(0);
    expect(command?.stderr).not.toBe("");
  });
});
