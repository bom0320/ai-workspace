import { z } from "zod";
import { invokeSpecialistRequestSchema } from "../../../../model/authority.js";

const text = z.string().min(1);
export const analysisRefinementSchema = z
  .object({
    id: text,
    rootScopeId: text,
    basisDigest: text,
    assessmentDigest: text,
    changeDigest: text,
    requests: z.array(invokeSpecialistRequestSchema).min(1),
  })
  .strict();
export type AnalysisRefinement = z.infer<typeof analysisRefinementSchema>;
export const MAX_ANALYSIS_REFINEMENTS = 2;
