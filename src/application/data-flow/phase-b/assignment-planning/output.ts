import type {
  AssignmentRegistrationError,
  registerAssignmentPlan,
} from "@/application/governance/index.js";

export type AssignmentPlanningOutput =
  | { status: "prepared"; plan: ReturnType<typeof registerAssignmentPlan> }
  | {
      status: "denied";
      failure: AssignmentRegistrationError["failure"] | "agent";
      reason: string;
    };
