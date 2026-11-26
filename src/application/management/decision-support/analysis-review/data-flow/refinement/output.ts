import type { StaffingAssignment } from "@/application/management/allocation/analysis-assignment/index.js";

export type AssignmentChange = Omit<StaffingAssignment, "assignmentId">;
