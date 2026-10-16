import { createInterface } from "node:readline";

import { afterEach, expect, it, vi } from "vitest";

import { approveCommit, askCommitMessage, approvePush } from "./delivery.js";
vi.mock("node:readline", () => ({ createInterface: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
function input(lines: string[]) {
  const close = vi.fn();
  vi.mocked(createInterface).mockReturnValue({ close, async *[Symbol.asyncIterator]() { yield* lines; } } as unknown as ReturnType<typeof createInterface>);
  vi.spyOn(console, "log").mockImplementation(() => {});
  return close;
}
it.each(["Commit", "  COMMIT  "])("accepts explicit Commit: %s", async (answer) => {
  const close = input([answer]); expect(await approveCommit()).toBe(true); expect(close).toHaveBeenCalledOnce();
});
it.each(["Skip", "Approve", "yes"])("rejects other Commit choices: %s", async (answer) => {
  input([answer]); expect(await approveCommit()).toBe(false);
});
it("accepts Push and rejects unrelated approvals", async () => {
  input(["Push"]); expect(await approvePush()).toBe(true);
  input(["Approve"]); expect(await approvePush()).toBe(false);
});
it("rejects EOF for delivery approvals", async () => {
  input([]); expect(await approveCommit()).toBe(false); expect(await approvePush()).toBe(false);
});
it("returns the message unchanged for validation", async () => {
  const close = input(["docs: update README"]); expect(await askCommitMessage()).toBe("docs: update README"); expect(close).toHaveBeenCalledOnce();
});
