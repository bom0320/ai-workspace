import type { StaffingSystemPolicy } from "../../approval/features/system-policy/model/policy.js";
import type { StaffingAssignmentConstraints } from "@/application/staffing/index.js";

export type StaffingSystemPolicyResult =
  | {
      status: "ready";
      configuration: StaffingSystemPolicy;
      version: number;
      assignmentConstraints?: StaffingAssignmentConstraints;
    }
  | { status: "denied"; reason: string };
