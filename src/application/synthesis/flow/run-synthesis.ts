import {
  synthesisContextSchema,
  type SynthesisContext,
} from "../protocol/context.js";
import {
  ceoSynthesisDecisionSchema,
  type CEOSynthesisAgent,
} from "../protocol/ceo.js";
import type { SynthesisResult } from "../model/result.js";
import {
  runCodexCEOSynthesis,
  CodexSynthesisError,
} from "../ceo/codex-ceo-synthesis.js";
import { validateSynthesisContext } from "./validation/validate-context.js";
import {
  validateOutputReferences,
  validateProposalCoverage,
} from "./validation/validate-output.js";

export type RunSynthesisOptions = {
  agent?: CEOSynthesisAgent;
  timeoutMs?: number;
};

export async function runSynthesis(
  input: unknown,
  options: RunSynthesisOptions = {}
): Promise<SynthesisResult> {
  // 1. Capture and Validate the Original Context
  let context: SynthesisContext;
  try {
    context = synthesisContextSchema.parse(input);
    validateSynthesisContext(context);
  } catch {
    return {
      status: "failed",
      failure: "invalid-input",
      reason: "Invalid Synthesis input or source bindings.",
    };
  }

  // 2. Execute One CEO Call Against a Detached Copy
  const { agent, timeoutMs } = options;
  let output: unknown;
  try {
    output = await (agent ?? ((ctx) => runCodexCEOSynthesis(ctx, timeoutMs)))(
      structuredClone(context)
    );
  } catch (error) {
    const failure =
      error instanceof CodexSynthesisError ? error.failure : "agent-execution";
    return {
      status: "failed",
      failure,
      reason:
        failure === "timeout"
          ? "CEO Synthesis timed out."
          : failure === "malformed-json"
            ? "CEO Synthesis returned malformed JSON."
            : "CEO Synthesis execution failed.",
    };
  }

  // 3. Validate the Output Protocol and Source Integrity Separately
  const parsed = ceoSynthesisDecisionSchema.safeParse(output);
  if (!parsed.success)
    return {
      status: "failed",
      failure: "invalid-output",
      reason: "Invalid CEO Synthesis output schema.",
    };
  const action = parsed.data;
  try {
    validateOutputReferences(context, action);
  } catch {
    return {
      status: "failed",
      failure: "invalid-references",
      reason: "Invalid CEO Synthesis SourceReferences.",
    };
  }

  // 4. Require Reasoned Coverage for Proposals, Not for Escalation
  if (action.type === "escalate")
    return {
      status: "escalated",
      reason: action.reason,
      questions: action.questions,
      sources: action.sources,
    };
  try {
    validateProposalCoverage(context, action.proposal);
  } catch {
    return {
      status: "failed",
      failure: "incomplete-coverage",
      reason: "CEO Synthesis omitted or misplaced a concern treatment.",
    };
  }
  return { status: "proposed", proposal: action.proposal };
}
