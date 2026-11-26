import { expect, it, vi } from "vitest";
import { runCli } from "./cli.js";
import { runGovernanceCli } from "./commands/governance/index.js";

vi.mock("./commands/governance/index.js", () => ({
  runGovernanceCli: vi.fn(),
}));

it("routes Governance administration", async () => {
  vi.mocked(runGovernanceCli).mockResolvedValueOnce(0);
  expect(await runCli(["governance", "approve", "proposal.json"])).toBe(0);
  expect(runGovernanceCli).toHaveBeenCalledExactlyOnceWith([
    "approve",
    "proposal.json",
  ]);
});
