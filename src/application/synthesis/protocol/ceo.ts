import { z } from "zod";
import { synthesisProposalSchema } from "../model/proposal.js";
import { synthesisEscalationSchema } from "../model/result.js";
import type { SynthesisContext } from "./context.js";

export const ceoSynthesisDecisionSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("propose"), proposal: synthesisProposalSchema })
    .strict(),
  synthesisEscalationSchema.extend({ type: z.literal("escalate") }),
]);
export type CEOSynthesisDecision = z.infer<typeof ceoSynthesisDecisionSchema>;
export type CEOSynthesisAgent = (
  context: SynthesisContext
) => Promise<CEOSynthesisDecision>;
