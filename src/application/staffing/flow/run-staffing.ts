import { z, ZodError } from "zod";

import { assertRepositoryMatchesSnapshot } from "@/application/decision/index.js";

import {
  CodexCEOError,
  runCodexCEO,
  type CodexCEOOptions,
} from "../ceo/codex-ceo.js";
import type { StaffingRunResult } from "../model/result.js";
import {
  ceoStaffingDecisionSchema,
  type CEOStaffingAgent,
} from "../protocol/ceo.js";
import {
  discoverStaffingContext,
  createStaffingContext,
  inspectStaffingContext,
  type DiscoverStaffingContextOptions,
} from "./discover-context.js";

export type RunStaffingOptions = DiscoverStaffingContextOptions &
  CodexCEOOptions & {
    maxRounds: number;
    agent?: CEOStaffingAgent;
  };

const callLimitsSchema = z
  .object({
    maxRounds: z.number().int().positive(),
    timeoutMs: z.number().int().positive().max(2_147_483_647).optional(),
  })
  .strict();

type Failure = Extract<StaffingRunResult, { status: "failed" }>["failure"];

export async function runStaffing(
  options: RunStaffingOptions
): Promise<StaffingRunResult> {
  let rounds = 0;
  const fail = (failure: Failure, reason: string): StaffingRunResult => ({
    status: "failed",
    failure,
    reason,
    rounds,
  });
  const limits = callLimitsSchema.safeParse({
    maxRounds: options.maxRounds,
    timeoutMs: options.timeoutMs,
  });
  if (!limits.success)
    return fail(
      "invalid-input",
      "CEO maxRounds and timeoutMs must be valid positive integer limits."
    );

  const discovery = discoverStaffingContext(options);
  if (discovery.status === "failed") {
    return fail(
      "discovery",
      "Staffing context discovery failed; check inputs, repository state, allowlist and inspection limits."
    );
  }
  let state = discovery.state;
  const agent: CEOStaffingAgent =
    options.agent ??
    ((context) => runCodexCEO(context, { timeoutMs: limits.data.timeoutMs }));

  while (rounds < limits.data.maxRounds) {
    try {
      assertRepositoryMatchesSnapshot(state.snapshot);
    } catch {
      return fail(
        "snapshot-drift",
        "Repository no longer matches the captured staffing Snapshot."
      );
    }

    let context;
    try {
      context = createStaffingContext(state);
    } catch {
      return fail(
        "discovery",
        "Unable to project StaffingContext from Harness state."
      );
    }

    let output: unknown;
    rounds += 1;
    try {
      output = await agent(context);
    } catch (error) {
      if (error instanceof CodexCEOError)
        return fail(error.failure, error.message);
      if (error instanceof ZodError)
        return fail(
          "schema-validation",
          "CEO response failed the staffing decision schema."
        );
      return fail("agent-process", "CEO staffing agent failed.");
    }

    // Required even for the final propose/escalate response. Also checked before
    // inspecting or calling the CEO again; no returned decision grants authority.
    try {
      assertRepositoryMatchesSnapshot(state.snapshot);
    } catch {
      return fail(
        "snapshot-drift",
        "Repository changed during the CEO staffing call."
      );
    }
    const parsed = ceoStaffingDecisionSchema.safeParse(output);
    if (!parsed.success)
      return fail(
        "schema-validation",
        "CEO response failed the staffing decision schema."
      );
    const decision = parsed.data;
    if (decision.type === "propose")
      return { status: "proposed", draft: decision.draft, rounds };
    if (decision.type === "escalate")
      return {
        status: "escalated",
        reason: decision.reason,
        questions: decision.questions,
        rounds,
      };
    if (rounds === limits.data.maxRounds)
      return fail(
        "round-limit",
        "CEO staffing round limit reached before further inspection."
      );

    const inspection = inspectStaffingContext(state, decision);
    if (inspection.status === "failed") {
      try {
        assertRepositoryMatchesSnapshot(state.snapshot);
      } catch {
        return fail(
          "snapshot-drift",
          "Repository changed during staffing inspection."
        );
      }
      return fail(
        "inspection",
        "Staffing inspection failed; request did not satisfy file access or inspection budget checks."
      );
    }
    state = inspection.state;
  }
  return fail("round-limit", "CEO staffing round limit reached.");
}
