import type { ApprovedDecision } from "../../approval/features/direction-review/model/result.js";
import type { ExecutionDelegation } from "../../approval/features/execution-delegation/model/execution-delegation.js";

export type ExecutionHandoffApproval = {
  decision: ApprovedDecision;
  executionDelegation: ExecutionDelegation;
};
