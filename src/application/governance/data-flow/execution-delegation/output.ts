import type { ApprovedDecision } from "../../approval/features/direction-review/model/approved-decision.js";
import type {
  ExecutionDelegation,
  ExecutionDelegationRequest,
} from "../../approval/features/execution-delegation/model/execution-delegation.js";
import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";

export type ExecutionDelegationApprovalResult =
  | {
      status: "confirmation-required";
      binding: string;
      decision: ApprovedDecision;
      snapshot: RepositorySnapshot;
      grant: ExecutionDelegationRequest;
      workerModeNotice?: string;
    }
  | { status: "approved"; executionDelegation: ExecutionDelegation }
  | { status: "denied"; reason: string };
