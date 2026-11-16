import { END, START, StateGraph } from "@langchain/langgraph";
import { phaseAState } from "./state.js";
import {
  createRunStaffingNode,
  type StaffingExecutionOptions,
} from "./features/staffing/nodes/run-staffing.js";
import { evaluateStaffingApproval } from "./features/governance/nodes/evaluate-staffing-approval.js";
import { loadSystemPolicy } from "./features/governance/nodes/load-system-policy.js";
import {
  createConfirmStaffingApprovalNode,
  type StaffingConfirmationOptions,
} from "./features/governance/nodes/confirm-staffing-approval.js";

import { collectStaffingApprovalResult } from "./features/governance/nodes/collect-staffing-approval-result.js";

import { preflightSpecialistDecisionsNode } from "./features/decision/nodes/preflight-specialist-decisions.js";
import { executeNextSpecialist } from "./features/decision/nodes/execute-next-specialist.js";
import { compareSpecialistDecisions } from "./features/comparison/nodes/compare-specialist-decisions.js";
import { completeSpecialistDecisions } from "./features/decision/nodes/complete-specialist-decisions.js";

export type PhaseAExecutionTarget =
  "staffing-approval" | "specialist-decisions";
export type PhaseAGraphOptions = StaffingExecutionOptions &
  StaffingConfirmationOptions & { executionTarget?: PhaseAExecutionTarget };

export function createPhaseAGraph(options: PhaseAGraphOptions = {}) {
  const { executionTarget = "staffing-approval" } = options;

  // 1. Register Workflow Nodes
  const graph = new StateGraph(phaseAState)
    .addNode("load-system-policy", loadSystemPolicy)
    .addNode("run-staffing", createRunStaffingNode(options))
    .addNode("evaluate-staffing-approval", evaluateStaffingApproval)
    .addNode(
      "confirm-staffing-approval",
      createConfirmStaffingApprovalNode(options.confirmApproval)
    )
    .addNode("collect-staffing-approval-result", collectStaffingApprovalResult)
    .addNode("preflight-specialist-decisions", preflightSpecialistDecisionsNode)
    .addNode("execute-next-specialist", executeNextSpecialist)
    .addNode("compare-specialist-decisions", compareSpecialistDecisions)
    .addNode("complete-specialist-decisions", completeSpecialistDecisions);

  // 2. Connect Execution Edges
  graph.addEdge(START, "load-system-policy");
  graph.addConditionalEdges(
    "load-system-policy",
    (state) =>
      state.policyLookup?.status === "ready"
        ? "run-staffing"
        : "collect-staffing-approval-result",
    ["run-staffing", "collect-staffing-approval-result"]
  );
  graph.addConditionalEdges(
    "run-staffing",
    (state) =>
      state.staffingResult?.status === "proposed"
        ? "evaluate-staffing-approval"
        : "collect-staffing-approval-result",
    ["evaluate-staffing-approval", "collect-staffing-approval-result"]
  );
  graph.addConditionalEdges(
    "evaluate-staffing-approval",
    (state) =>
      state.approvalResult?.status === "approval-required"
        ? "confirm-staffing-approval"
        : "collect-staffing-approval-result",
    ["confirm-staffing-approval", "collect-staffing-approval-result"]
  );
  graph.addEdge(
    "confirm-staffing-approval",
    "collect-staffing-approval-result"
  );
  // Execution target selects an endpoint; it never grants approval or authority.
  graph.addConditionalEdges(
    "collect-staffing-approval-result",
    (state) =>
      executionTarget === "specialist-decisions" &&
      state.staffingApprovalResult?.status === "approved"
        ? "preflight-specialist-decisions"
        : END,
    ["preflight-specialist-decisions", END]
  );
  graph.addConditionalEdges(
    "preflight-specialist-decisions",
    (state) =>
      state.specialistDecisionsResult?.status === "failed"
        ? END
        : "execute-next-specialist",
    [END, "execute-next-specialist"]
  );
  // Sequential repetition and fail-fast belong to the Graph, never to a Node loop.
  graph.addConditionalEdges(
    "execute-next-specialist",
    (state) => {
      if (state.specialistDecisionsResult?.status === "failed") return END;
      if (
        (state.currentSpecialistIndex ?? 0) <
        (state.preparedSpecialistRequests?.length ?? 0)
      )
        return "execute-next-specialist";
      return state.collectedDecisions?.length === 1
        ? "complete-specialist-decisions"
        : "compare-specialist-decisions";
    },
    [
      END,
      "execute-next-specialist",
      "complete-specialist-decisions",
      "compare-specialist-decisions",
    ]
  );
  graph.addConditionalEdges(
    "compare-specialist-decisions",
    (state) =>
      state.specialistDecisionsResult?.status === "failed"
        ? END
        : "complete-specialist-decisions",
    [END, "complete-specialist-decisions"]
  );
  graph.addEdge("complete-specialist-decisions", END);

  // Approval may persist Scope: no retry policy or resume mechanism is installed.
  // 3. Compile Graph
  // The finite Assignment cursor bounds repetition. LangGraph's default 25 steps
  // must not become an additional Invocation budget; callers may set a lower limit.
  return graph
    .compile()
    .withConfig({ recursionLimit: Number.MAX_SAFE_INTEGER });
}
