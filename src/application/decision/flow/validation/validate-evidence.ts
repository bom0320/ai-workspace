import type { SpecialistContext } from "../../protocol/context.js";
import type { AgentDecision } from "../../protocol/decision.js";

export function validateDecisionEvidence(
  context: SpecialistContext,
  decision: AgentDecision,
): void {
  for (const evidence of decision.evidence) {
    const file = context.files.find((file) => file.path === evidence.path);
    if (file === undefined) {
      throw new Error(`Evidence path was not supplied to the Specialist: ${evidence.path}.`);
    }

    const { lineStart, lineEnd } = evidence;
    if (lineStart === undefined) {
      if (lineEnd !== undefined) {
        throw new Error(`Evidence lineEnd exists without lineStart: ${evidence.path}.`);
      }
      continue;
    }

    const lineCount = file.content.split(/\r?\n/).length;
    if (lineStart > lineCount) {
      throw new Error(`Evidence lineStart exceeds file line count: ${evidence.path} (${lineStart} > ${lineCount}).`);
    }
    if (lineEnd !== undefined) {
      if (lineEnd > lineCount) {
        throw new Error(`Evidence lineEnd exceeds file line count: ${evidence.path} (${lineEnd} > ${lineCount}).`);
      }
      if (lineStart > lineEnd) {
        throw new Error(`Evidence lineStart is greater than lineEnd: ${evidence.path} (${lineStart} > ${lineEnd}).`);
      }
    }
  }
}
