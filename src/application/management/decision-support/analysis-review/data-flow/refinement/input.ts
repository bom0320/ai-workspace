import type { GoalSpec } from "@/contracts/goal.js";
import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";
import type { StaffingSystemPolicy } from "@/contracts/governance/staffing-system-policy.js";
import type { IntentAnalysis } from "@/application/management/allocation/analysis-assignment/index.js";
import type { AnalysisAssignment } from "@/contracts/management/analysis-assignment.js";
import type { AssessmentResult } from "../assessment/output.js";
import type { AssignmentChange } from "./output.js";

export type NormalizeRefinementChangesInput = [
  result: Extract<AssessmentResult, { status: "refinement-required" }>,
  current: Pick<
    AnalysisAssignment,
    "specialistId" | "objective" | "contextPaths"
  >[],
  snapshot: RepositorySnapshot,
  policy: StaffingSystemPolicy,
];

export type BuildRefinementProposalInput = [
  assignments: AssignmentChange[],
  reason: string,
  intent: IntentAnalysis,
  goal: GoalSpec,
  snapshot: RepositorySnapshot,
];
