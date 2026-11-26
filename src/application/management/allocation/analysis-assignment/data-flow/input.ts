import type { GoalSpec } from "@/contracts/goal.js";
import type { StaffingSystemPolicy } from "@/contracts/staffing/system-policy.js";
import type { CEOStaffingAgent } from "../protocol/ceo.js";
import type { StaffingAssignmentConstraints } from "../protocol/context.js";

export type RunStaffingOptions = {
  goal: GoalSpec;
  systemPolicy: StaffingSystemPolicy;
  assignmentConstraints?: StaffingAssignmentConstraints;
  maxRounds: number;
  timeoutMs?: number;
  agent?: CEOStaffingAgent;
};
