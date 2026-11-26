import type {
  AssignmentExecutionRequest,
  reserveAssignmentExecution,
} from "@/application/governance/index.js";

export type AssignmentExecutionInput = {
  handoff: Parameters<typeof reserveAssignmentExecution>[0];
  request: Extract<AssignmentExecutionRequest, { access: "read" }>;
};
