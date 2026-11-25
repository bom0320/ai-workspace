import type { ApprovedWorkDecompositionInput } from "@/application/work-decomposition/index.js";
import type { HandoffOutput } from "../handoff/output.js";

export type WorkDecompositionInput = ApprovedWorkDecompositionInput &
  HandoffOutput;
