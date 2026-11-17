import {
  synthesisContextSchema,
  ceoSynthesisDecisionSchema,
  type CEOSynthesisAgent,
  type SynthesisContext,
  type SynthesisResult,
} from "./contracts.js";
import { runCodexCEOSynthesis } from "./codex-ceo-synthesis.js";
import {
  validateSynthesisContext,
  validateSynthesisSources,
} from "./validation.js";

export type RunSynthesisOptions = {
  agent?: CEOSynthesisAgent;
  timeoutMs?: number;
};

export async function runSynthesis(
  input: unknown,
  options: RunSynthesisOptions = {}
): Promise<SynthesisResult> {
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
  let output: unknown;
  try {
    // Keep the validation baseline private even when an injected Agent mutates its input.
    output = await (
      options.agent ?? ((ctx) => runCodexCEOSynthesis(ctx, options.timeoutMs))
    )(structuredClone(context));
  } catch {
    return {
      status: "failed",
      failure: "agent-execution",
      reason: "CEO Synthesis execution failed.",
    };
  }
  try {
    const action = ceoSynthesisDecisionSchema.parse(output);
    validateSynthesisSources(context, action);
    return action.type === "propose"
      ? { status: "proposed", proposal: action.proposal }
      : {
          status: "escalated",
          reason: action.reason,
          questions: action.questions,
          sources: action.sources,
        };
  } catch {
    return {
      status: "failed",
      failure: "invalid-output",
      reason: "Invalid CEO Synthesis output or SourceReferences.",
    };
  }
}
