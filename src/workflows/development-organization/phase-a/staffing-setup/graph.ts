import { END, START, StateGraph } from "@langchain/langgraph";
import { staffingSetupState, staffingSetupOutput } from "./state.js";
import {
  createRunStaffingNode,
  type StaffingExecutionOptions,
} from "./nodes/run-staffing.js";
import { evaluateStaffingApproval } from "./nodes/evaluate-staffing-approval.js";
import { loadSystemPolicy } from "./nodes/load-system-policy.js";
import {
  createConfirmStaffingApprovalNode,
  type StaffingConfirmationOptions,
} from "./nodes/confirm-staffing-approval.js";

import { collectStaffingSetupResult } from "./nodes/collect-staffing-setup-result.js";

export type StaffingSetupGraphOptions = StaffingExecutionOptions &
  StaffingConfirmationOptions;

export function createStaffingSetupGraph(
  options: StaffingSetupGraphOptions = {}
) {
  // 1. Register Workflow Nodes
  const graph = new StateGraph(staffingSetupState, {
    output: staffingSetupOutput,
  })
    .addNode("load-system-policy", loadSystemPolicy)
    .addNode("run-staffing", createRunStaffingNode(options))
    .addNode("evaluate-staffing-approval", evaluateStaffingApproval)
    .addNode(
      "confirm-staffing-approval",
      createConfirmStaffingApprovalNode(options.confirmApproval)
    )
    .addNode("collect-staffing-setup-result", collectStaffingSetupResult);

  // 2. Connect Execution Edges
  graph.addEdge(START, "load-system-policy");
  graph.addConditionalEdges("load-system-policy", (state) =>
    state.policyLookup?.status === "ready"
      ? "run-staffing"
      : "collect-staffing-setup-result"
  );
  graph.addConditionalEdges("run-staffing", (state) =>
    state.staffingResult?.status === "proposed"
      ? "evaluate-staffing-approval"
      : "collect-staffing-setup-result"
  );
  graph.addConditionalEdges("evaluate-staffing-approval", (state) =>
    state.approvalResult?.status === "approval-required"
      ? "confirm-staffing-approval"
      : "collect-staffing-setup-result"
  );
  graph.addEdge("confirm-staffing-approval", "collect-staffing-setup-result");
  graph.addEdge("collect-staffing-setup-result", END);

  // Approval may persist Scope: no retry policy or resume mechanism is installed.
  // 3. Compile Graph
  return graph.compile();
}
