import { z } from "zod";
import { getApprovedDecision } from "@/application/governance/index.js";
import {
  ceoWorkDecompositionDecisionSchema,
  type CEOWorkDecompositionAgent,
  type WorkDecompositionContext,
} from "../protocol/ceo.js";
import type { WorkDecompositionResult } from "../model/result.js";
import {
  CodexWorkDecompositionError,
  runCodexCEOWorkDecomposition,
} from "../ceo/codex-ceo.js";
import { validateDependencies } from "@/contracts/validate-dependencies.js";

export const workDecompositionInputSchema = z
  .object({ approvedDecisionId: z.string().trim().min(1) })
  .strict();

export type WorkDecompositionInput = z.infer<
  typeof workDecompositionInputSchema
>;

export type RunWorkDecompositionOptions = {
  agent?: CEOWorkDecompositionAgent;
  timeoutMs?: number;
  executionCeiling?: WorkDecompositionContext["executionCeiling"];
};

export async function runWorkDecomposition(
  input: unknown,
  { agent, timeoutMs, executionCeiling }: RunWorkDecompositionOptions = {}
): Promise<WorkDecompositionResult> {
  const parsedInput = workDecompositionInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      status: "failed",
      failure: "invalid-input",
      reason: "An Approved Decision ID is required for Work Decomposition.",
    };
  }

  let approved: ReturnType<typeof getApprovedDecision>;
  try {
    approved = getApprovedDecision(parsedInput.data.approvedDecisionId);
  } catch {
    return {
      status: "failed",
      failure: "invalid-input",
      reason: "Approved Decision could not be restored for Work Decomposition.",
    };
  }

  const { context, decision, review, snapshot } = approved;
  const ceoContext: WorkDecompositionContext = {
    goal: context.goal,
    proposal: review.proposal,
    decisions: context.decisions,
    comparison: context.comparison,
    snapshot,
    ...(executionCeiling && { executionCeiling }),
    approvalSource: {
      approvedDecisionId: decision.id,
      reviewId: decision.reviewId,
      approvalRecordId: decision.approvalRecordId,
    },
  };

  let output: unknown;
  try {
    output = await (
      agent ?? ((value) => runCodexCEOWorkDecomposition(value, timeoutMs))
    )(structuredClone(ceoContext));
  } catch (error) {
    const failure =
      error instanceof CodexWorkDecompositionError
        ? error.failure
        : "agent-execution";
    return {
      status: "failed",
      failure,
      reason:
        failure === "timeout"
          ? "CEO Work Decomposition timed out."
          : failure === "malformed-json"
            ? "CEO Work Decomposition returned malformed JSON."
            : "CEO Work Decomposition execution failed.",
    };
  }

  const parsedOutput = ceoWorkDecompositionDecisionSchema.safeParse(output);
  if (!parsedOutput.success) {
    return {
      status: "failed",
      failure: "invalid-output",
      reason: "Invalid CEO Work Decomposition output schema.",
    };
  }

  const action = parsedOutput.data;
  if (action.type === "escalate") {
    return {
      status: "escalated",
      reason: action.reason,
      questions: action.questions,
    };
  }

  if (!agent && action.workItems.some(({ workType }) => workType === undefined))
    return {
      status: "failed",
      failure: "invalid-output",
      reason: "Every CEO Work Item must declare its execution type.",
    };

  const reason = validateDependencies(action.workItems);
  if (reason)
    return { status: "failed", failure: "invalid-dependencies", reason };
  return {
    status: "proposed",
    approvedDecisionId: decision.id,
    workItems: action.workItems,
  };
}
