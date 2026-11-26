import type { AnalysisAssignment } from "@/contracts/management/analysis-assignment.js";

export type AssignmentChange = Omit<AnalysisAssignment, "assignmentId">;
