import type {
  ApprovedDecision,
  VerifiedPhaseBContext,
} from "@/application/governance/index.js";
import type {
  WorkDecompositionContext,
  CEOWorkDecompositionAgent,
} from "../protocol/ceo.js";

export type ApprovedWorkDecompositionInput = {
  handoff: { decision: ApprovedDecision };
  executionDelegationGrant: WorkDecompositionContext["executionDelegationGrant"];
  approved: Pick<
    VerifiedPhaseBContext,
    "context" | "synthesisProposal" | "snapshot"
  >;
};

export type RunWorkDecompositionOptions = {
  agent?: CEOWorkDecompositionAgent;
  timeoutMs?: number;
};
