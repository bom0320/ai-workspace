import type { GoalSpec } from "@/contracts/goal.js";
import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";
import type { StaffingSystemPolicy } from "@/contracts/staffing/system-policy.js";
import type {
  IntentAnalysis,
  StaffingAssignment,
} from "@/application/management/allocation/analysis-assignment/index.js";
import type { AssessmentResult } from "../assessment/output.js";
import type { AssignmentChange } from "./output.js";

export type NormalizeRefinementChangesInput = [
  result: Extract<AssessmentResult, { status: "refinement-required" }>,
  current: Pick<
    StaffingAssignment,
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
