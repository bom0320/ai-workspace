// The stock Codex Worker grants workspace-wide writes and the existing
// verification runner uses a shell. This path has no conforming runtime.
export function checkGovernedWorkerRuntime() {
  return {
    status: "blocked" as const,
    reason: "Worker runtime cannot enforce approved file and command limits.",
  };
}
