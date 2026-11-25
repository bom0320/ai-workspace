import type { VerifiedPhaseBContext } from "@/application/governance/index.js";
import type { PhaseBHandoff } from "./input.js";

// The Workflow carries the pair in its input channel and stores only the added analysis.
export type HandoffOutput = {
  handoff: PhaseBHandoff;
  approved: VerifiedPhaseBContext;
};
