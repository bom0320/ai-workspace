import type { PhaseBHandoff } from "../handoff/input.js";
import type { HandoffOutput } from "../handoff/output.js";

export type WorkDecompositionInput = {
  handoff: Pick<PhaseBHandoff, "decision">;
  executionDelegationGrant?: PhaseBHandoff["executionDelegation"]["grant"];
  approved: Pick<HandoffOutput, "context" | "synthesisProposal" | "snapshot">;
};
