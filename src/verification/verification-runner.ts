import { spawnSync } from "node:child_process";

export type VerificationCommandResult = {
  command: string;
  passed: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export type VerificationResult = {
  passed: boolean;
  commands: VerificationCommandResult[];
};

export function runVerification(
  verification: string[],
  workspaceRoot: string,
): VerificationResult {
  const commands = verification.map((command) => {
    const result = spawnSync(command, {
      cwd: workspaceRoot,
      encoding: "utf8",
      shell: true,
    });
    const stderr = [result.stderr, result.error?.message]
      .filter((value): value is string => Boolean(value))
      .join("\n");

    return {
      command,
      passed: result.status === 0 && result.error === undefined,
      exitCode: result.status,
      stdout: result.stdout ?? "",
      stderr,
    };
  });

  return {
    passed: commands.every((command) => command.passed),
    commands,
  };
}
