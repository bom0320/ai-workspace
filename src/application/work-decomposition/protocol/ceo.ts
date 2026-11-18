import { z } from "zod";
import type {
  SynthesisContext,
  SynthesisProposal,
} from "@/application/synthesis/index.js";
import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";
import { escalationSchema } from "../model/result.js";
import { workItemsSchema } from "../model/work.js";

export type WorkDecompositionContext = Pick<
  SynthesisContext,
  "goal" | "decisions" | "comparison"
> & {
  proposal: SynthesisProposal;
  snapshot: RepositorySnapshot;
  approvalSource: {
    approvedDecisionId: string;
    reviewId: string;
    approvalRecordId: string;
  };
};

export const ceoWorkDecompositionDecisionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("propose"),
      workItems: workItemsSchema,
    })
    .strict(),
  escalationSchema.extend({ type: z.literal("escalate") }),
]);

export type CEOWorkDecompositionAgent = (
  context: WorkDecompositionContext
) => Promise<unknown>;
