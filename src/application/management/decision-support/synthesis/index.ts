export { runSynthesis } from "./flow/run-synthesis.js";
export {
  synthesisContextSchema,
  type RunSynthesisOptions,
  type SynthesisContext,
  type CEOSynthesisAgent,
} from "./data-flow/input.js";
export { validateAnalysisReferences } from "./flow/validation/validate-output.js";
export { synthesisProposalSchema } from "./model/proposal.js";
export {
  synthesisResultSchema,
  type SynthesisResult,
} from "./data-flow/output.js";
export { ceoSynthesisDecisionSchema } from "./protocol/ceo.js";
export type { SynthesisProposal } from "./model/proposal.js";
export type { CEOSynthesisDecision } from "./protocol/ceo.js";
