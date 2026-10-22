import { createInterface } from "node:readline";

import { afterEach, expect, it, vi } from "vitest";

import { completeReview } from "./review.js";
vi.mock("node:readline", () => ({ createInterface: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
it.each([
  { lines: ["Continue"], expected: true },
  { lines: ["  CONTINUE  "], expected: true },
  { lines: ["Abort"], expected: false },
  { lines: ["yes"], expected: false },
  { lines: [], expected: false },
])("requires explicit Continue: $lines", async ({ lines, expected }) => {
  const close = vi.fn();
  vi.mocked(createInterface).mockReturnValue({
    close,
    async *[Symbol.asyncIterator]() {
      yield* lines;
    },
  } as unknown as ReturnType<typeof createInterface>);
  vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await completeReview()).toBe(expected);
  expect(close).toHaveBeenCalledOnce();
});
