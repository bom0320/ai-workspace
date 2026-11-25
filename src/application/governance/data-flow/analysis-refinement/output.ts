import type { StaffingProposal } from "@/application/staffing/index.js";
import type { AnalysisRefinement } from "../../model/analysis-refinement.js";

export type AnalysisRefinementPreparationResult =
  | { status: "ready"; round: AnalysisRefinement }
  | { status: "proposal-required"; proposal: StaffingProposal };
