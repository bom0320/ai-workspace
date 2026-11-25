import {
  workDecompositionInputSchema,
  type ApprovedWorkDecompositionInput,
} from "../data-flow/input.js";
import { getApprovedDecision } from "@/application/governance/index.js";
import {
  ceoWorkDecompositionDecisionSchema,
  type CEOWorkDecompositionAgent,
  type WorkDecompositionContext,
} from "../protocol/ceo.js";
import { validateWorkItemSources } from "../model/work.js";
import type { WorkDecompositionResult } from "../data-flow/output.js";
import {
  CodexWorkDecompositionError,
  runCodexCEOWorkDecomposition,
} from "../ceo/codex-ceo.js";
import { validateDependencies } from "@/contracts/shared/validate-dependencies.js";

export type RunWorkDecompositionOptions = {
  agent?: CEOWorkDecompositionAgent;
  timeoutMs?: number;
  executionDelegationGrant?: WorkDecompositionContext["executionDelegationGrant"];
};

export async function runWorkDecomposition(
  input: unknown,
  options: RunWorkDecompositionOptions = {}
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
  return decomposeApprovedWork(
    {
      handoff: { decision },
      approved: { context, synthesisProposal: review.proposal, snapshot },
      executionDelegationGrant: options.executionDelegationGrant,
    },
    options
  );
}

export async function decomposeApprovedWork(
  {
    handoff: { decision },
    approved: { context, synthesisProposal, snapshot },
    executionDelegationGrant,
  }: ApprovedWorkDecompositionInput,
  { agent, timeoutMs }: RunWorkDecompositionOptions = {}
): Promise<WorkDecompositionResult> {
  const ceoContext: WorkDecompositionContext = {
    goal: context.goal,
    proposal: synthesisProposal,
    decisions: context.decisions,
    comparison: context.comparison,
    snapshot,
    ...(executionDelegationGrant && { executionDelegationGrant }),
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

  const reason = validateDependencies(action.workItems);
  if (reason)
    return { status: "failed", failure: "invalid-dependencies", reason };
  try {
    validateWorkItemSources(context, action.workItems);
  } catch {
    return {
      status: "failed",
      failure: "invalid-output",
      reason: "Invalid Work Item analysis source references.",
    };
  }
  return {
    status: "proposed",
    approvedDecisionId: decision.id,
    workItems: action.workItems,
  };
}
