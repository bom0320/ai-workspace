import { createInterface } from "node:readline";

import { afterEach, describe, expect, it, vi } from "vitest";

import { approveApply } from "./apply-changes.js";

vi.mock("node:readline", () => ({ createInterface: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); });

describe("approveApply", () => {
  it.each([
    { lines: ["Apply"], approved: true },
    { lines: ["  APPLY  "], approved: true },
    { lines: ["Skip"], approved: false },
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
    expect(await approveApply()).toBe(approved);
    expect(close).toHaveBeenCalledOnce();
    expect(console.log).not.toHaveBeenCalledWith("\nTask Contract:");
  });
});
