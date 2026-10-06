import { runCommand } from "../../infrastructure/process/index.js";

export const DEFAULT_VERIFICATION_TIMEOUT_MS = 5 * 60 * 1_000;

export type VerificationCommandResult = {
  command: string;
  passed: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

export type VerificationResult = {
  passed: boolean;
  commands: VerificationCommandResult[];
};

export async function runVerification(
  verification: string[],
  workspaceRoot: string,
  timeoutMs = DEFAULT_VERIFICATION_TIMEOUT_MS,
): Promise<VerificationResult> {
  const commands: VerificationCommandResult[] = [];

  for (const command of verification) {
    const result = await runCommand(command, [], {
      cwd: workspaceRoot,
      shell: true,
      timeoutMs,
    });
    const timeoutMessage = result.timedOut
      ? `Verification command timed out after ${timeoutMs} ms.`
      : "";
    const stderr = [result.stderr, result.error?.message, timeoutMessage]
      .filter((value): value is string => Boolean(value))
      .join("\n");

    commands.push({
      command,
      passed:
        result.exitCode === 0 &&
        result.error === undefined &&
        !result.timedOut,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr,
      ...(result.timedOut ? { timedOut: true } : {}),
    });
  }

  return {
    passed: commands.every((command) => command.passed),
    commands,
  };
}
