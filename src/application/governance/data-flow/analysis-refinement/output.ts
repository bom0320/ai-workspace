import type { StaffingProposal } from "@/application/management/allocation/analysis-assignment/index.js";
import type { AnalysisRefinement } from "../../model/analysis-refinement.js";

export type AnalysisRefinementPreparationResult =
  | { status: "ready"; round: AnalysisRefinement }
  | { status: "proposal-required"; proposal: StaffingProposal };
