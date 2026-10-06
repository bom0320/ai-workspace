import { spawn } from "node:child_process";

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  error?: Error;
};

type CommandOptions = {
  cwd: string;
  timeoutMs: number;
  shell?: boolean;
};

const FORCE_KILL_DELAY_MS = 250;

export function runCommand(
  command: string,
  args: string[],
  options: CommandOptions,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: options.shell ?? false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let spawnError: Error | undefined;
    let timedOut = false;
    let closed = false;
    let forceKillCompleted = false;
    let exitCode: number | null = null;

    const killProcessTree = (signal: NodeJS.Signals): void => {
      if (child.pid === undefined) {
        return;
      }

      try {
        if (process.platform === "win32") {
          child.kill(signal);
        } else {
          process.kill(-child.pid, signal);
        }
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            error.code === "ESRCH"
          )
        ) {
          spawnError ??=
            error instanceof Error ? error : new Error(String(error));
        }
      }
    };

    const finish = (): void => {
      if (!closed || (timedOut && !forceKillCompleted)) {
        return;
      }

      resolve({
        stdout,
        stderr,
        exitCode,
        timedOut,
        ...(spawnError === undefined ? {} : { error: spawnError }),
      });
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code) => {
      exitCode = code;
      closed = true;
      finish();
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      killProcessTree("SIGTERM");

      setTimeout(() => {
        killProcessTree("SIGKILL");
        forceKillCompleted = true;
        finish();
      }, FORCE_KILL_DELAY_MS);
    }, options.timeoutMs);

    child.once("close", () => {
      clearTimeout(timeout);
    });
  });
}
