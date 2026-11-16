import { END, START, StateGraph } from "@langchain/langgraph";
import { phaseAState } from "./state.js";
import {
  createRunStaffingNode,
  type StaffingExecutionOptions,
} from "./nodes/staffing/run-staffing.js";
import { evaluateStaffingApproval } from "./nodes/approval/evaluate-staffing-approval.js";
import { loadSystemPolicy } from "./nodes/policy/load-system-policy.js";
import {
  createConfirmStaffingApprovalNode,
  type StaffingConfirmationOptions,
} from "./nodes/approval/confirm-staffing-approval.js";

import { collectStaffingApprovalResult } from "./nodes/collect-staffing-approval-result.js";

export type PhaseAGraphOptions = StaffingExecutionOptions &
  StaffingConfirmationOptions;

export function createPhaseAGraph(options: PhaseAGraphOptions = {}) {
  // 1. Register Workflow Nodes
  const graph = new StateGraph(phaseAState)
    .addNode("load-system-policy", loadSystemPolicy)
    .addNode("run-staffing", createRunStaffingNode(options))
    .addNode("evaluate-staffing-approval", evaluateStaffingApproval)
    .addNode(
      "confirm-staffing-approval",
      createConfirmStaffingApprovalNode(options.confirmApproval)
    )
    .addNode("collect-staffing-approval-result", collectStaffingApprovalResult);

  // 2. Connect Execution Edges
  graph.addEdge(START, "load-system-policy");
  graph.addConditionalEdges("load-system-policy", (state) =>
    state.policyLookup?.status === "ready"
      ? "run-staffing"
      : "collect-staffing-approval-result"
  );
  graph.addConditionalEdges("run-staffing", (state) =>
    state.staffingResult?.status === "proposed"
      ? "evaluate-staffing-approval"
      : "collect-staffing-approval-result"
  );
  graph.addConditionalEdges("evaluate-staffing-approval", (state) =>
    state.approvalResult?.status === "approval-required"
      ? "confirm-staffing-approval"
      : "collect-staffing-approval-result"
  );
  graph.addEdge(
    "confirm-staffing-approval",
    "collect-staffing-approval-result"
  );
  graph.addEdge("collect-staffing-approval-result", END);

  // Approval may persist Scope: no retry policy or resume mechanism is installed.
  // 3. Compile Graph
  return graph.compile();
}
