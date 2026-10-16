import { createInterface } from "node:readline";

import { afterEach, describe, expect, it, vi } from "vitest";

import { approveTask } from "./approve-task.js";

vi.mock("node:readline", () => ({ createInterface: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); });

describe("approveTask", () => {
  it.each([
    { lines: ["Approve"], approved: true },
    { lines: ["  APPROVE  "], approved: true },
    { lines: ["Reject"], approved: false },
    { lines: ["yes"], approved: false },
    { lines: [""], approved: false },
    { lines: [], approved: false },
  ])("handles $lines as approved=$approved", async ({ lines, approved }) => {
    const close = vi.fn();
    vi.mocked(createInterface).mockReturnValue({
      close,
      async *[Symbol.asyncIterator]() { yield* lines; },
    } as unknown as ReturnType<typeof createInterface>);
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await approveTask()).toBe(approved);
    expect(close).toHaveBeenCalledOnce();
    expect(console.log).not.toHaveBeenCalledWith("\nTask Contract:");
  });
});
