export {
  runSynthesis,
  type RunSynthesisOptions,
} from "./flow/run-synthesis.js";
export { synthesisContextSchema } from "./protocol/context.js";
export {
  synthesisProposalSchema,
  sourceReferenceSchema,
} from "./model/proposal.js";
export { synthesisResultSchema } from "./model/result.js";
export { ceoSynthesisDecisionSchema } from "./protocol/ceo.js";
export type { SynthesisContext } from "./protocol/context.js";
export type { SynthesisProposal, SourceReference } from "./model/proposal.js";
export type { SynthesisResult } from "./model/result.js";
export type {
  CEOSynthesisDecision,
  CEOSynthesisAgent,
} from "./protocol/ceo.js";
