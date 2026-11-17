import { createInterface } from "node:readline";

import { afterEach, expect, it, vi } from "vitest";

import { approveWorkspaceDeletion } from "./cleanup.js";
vi.mock("node:readline", () => ({ createInterface: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
it.each([
  { lines: ["Delete"], expected: true },
  { lines: ["  DELETE  "], expected: true },
  { lines: ["Keep"], expected: false },
  { lines: ["yes"], expected: false },
  { lines: [], expected: false },
])("requires explicit Delete: $lines", async ({ lines, expected }) => {
  const close = vi.fn();
  vi.mocked(createInterface).mockReturnValue({
    close,
    async *[Symbol.asyncIterator]() {
      yield* lines;
    },
  } as unknown as ReturnType<typeof createInterface>);
  vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await approveWorkspaceDeletion()).toBe(expected);
  expect(close).toHaveBeenCalledOnce();
});
