import type { StaffingAssignment } from "@/application/staffing/index.js";

export type AssignmentChange = Omit<StaffingAssignment, "assignmentId">;
