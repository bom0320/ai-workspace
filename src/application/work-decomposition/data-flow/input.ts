import { z } from "zod";
import type {
  ApprovedDecision,
  VerifiedPhaseBContext,
} from "@/application/governance/index.js";
import type {
  WorkDecompositionContext,
  CEOWorkDecompositionAgent,
} from "../protocol/ceo.js";

export const workDecompositionInputSchema = z
  .object({ approvedDecisionId: z.string().trim().min(1) })
  .strict();

export type WorkDecompositionInput = z.infer<
  typeof workDecompositionInputSchema
>;

export type ApprovedWorkDecompositionInput = {
  handoff: { decision: ApprovedDecision };
  executionDelegationGrant?: WorkDecompositionContext["executionDelegationGrant"];
  approved: Pick<
    VerifiedPhaseBContext,
    "context" | "synthesisProposal" | "snapshot"
  >;
};

export type RunWorkDecompositionOptions = {
  agent?: CEOWorkDecompositionAgent;
  timeoutMs?: number;
  executionDelegationGrant?: WorkDecompositionContext["executionDelegationGrant"];
};
