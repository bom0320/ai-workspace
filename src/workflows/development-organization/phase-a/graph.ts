import { humanDirectionReview } from "./features/governance/nodes/human-direction-review.js";
import {
  createFinalizeDirectionReviewNode,
  type DirectionConfirmationOptions,
} from "./features/governance/nodes/finalize-direction-review.js";
import { createRunCEOSynthesisNode } from "./features/synthesis/nodes/run-ceo-synthesis.js";
import type { RunSynthesisOptions } from "@/application/synthesis/index.js";
import { END, START, StateGraph, MemorySaver } from "@langchain/langgraph";
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

import { preflightSpecialistDecisionsNode } from "./features/decision/nodes/preflight-specialist-decisions.js";
import { executeNextSpecialist } from "./features/decision/nodes/execute-next-specialist.js";
import { compareSpecialistDecisions } from "./features/comparison/nodes/compare-specialist-decisions.js";

import {
  routeAfterStaffingApproval,
  routeAfterSpecialistExecution,
  routeAfterComparison,
  routeAfterSynthesis,
  type PhaseAExecutionTarget,
} from "./routing.js";

export type { PhaseAExecutionTarget } from "./routing.js";
export type PhaseAGraphOptions = StaffingExecutionOptions &
  StaffingConfirmationOptions &
  DirectionConfirmationOptions & {
    executionTarget?: PhaseAExecutionTarget;
    synthesis?: RunSynthesisOptions;
  };

export function createPhaseAGraph(options: PhaseAGraphOptions = {}) {
  const { executionTarget = "staffing-approval" } = options;

  const humanGovernance = executionTarget === "human-direction-governance";

  // 1. Register Workflow Nodes
  const graph = new StateGraph(phaseAState)
    .addNode("load-system-policy", loadSystemPolicy)
    .addNode("run-staffing", createRunStaffingNode(options))
    .addNode("evaluate-staffing-approval", evaluateStaffingApproval)
    .addNode(
      "confirm-staffing-approval",
      createConfirmStaffingApprovalNode(options.confirmApproval)
    )
    .addNode("preflight-specialist-decisions", preflightSpecialistDecisionsNode)
    .addNode("execute-next-specialist", executeNextSpecialist)
    .addNode("compare-specialist-decisions", compareSpecialistDecisions)
    .addNode(
      "run-ceo-synthesis",
      createRunCEOSynthesisNode(options.synthesis, {
        directionReview: humanGovernance,
      })
    )
    .addNode("human-direction-review", humanDirectionReview)
    .addNode(
      "finalize-direction-review",
      createFinalizeDirectionReviewNode(options.confirmDirection)
    );

  // 2. Connect Execution Edges
  graph.addEdge(START, "load-system-policy");
  graph.addConditionalEdges(
    "load-system-policy",
    (state) => (state.policyLookup?.status === "ready" ? "run-staffing" : END),
    ["run-staffing", END]
  );
  graph.addConditionalEdges(
    "run-staffing",
    (state) =>
      state.staffingResult?.status === "proposed"
        ? "evaluate-staffing-approval"
        : END,
    ["evaluate-staffing-approval", END]
  );
  graph.addConditionalEdges(
    "evaluate-staffing-approval",
    (state) =>
      state.approvalResult?.status === "approval-required"
        ? "confirm-staffing-approval"
        : routeAfterStaffingApproval(state, executionTarget),
    ["confirm-staffing-approval", "preflight-specialist-decisions", END]
  );
  graph.addConditionalEdges(
    "confirm-staffing-approval",
    (state) => routeAfterStaffingApproval(state, executionTarget),
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
    routeAfterSpecialistExecution,
    [END, "execute-next-specialist", "compare-specialist-decisions"]
  );
  // Stage 4 failure never enters Synthesis, and existing execution targets keep their endpoint.
  graph.addConditionalEdges(
    "compare-specialist-decisions",
    (state) => routeAfterComparison(state, executionTarget),
    ["run-ceo-synthesis", END]
  );
  graph.addConditionalEdges(
    "run-ceo-synthesis",
    (state) => routeAfterSynthesis(state, executionTarget),
    ["human-direction-review", END]
  );
  graph.addConditionalEdges(
    "human-direction-review",
    (state) =>
      state.directionAction && !state.directionGovernanceResult
        ? "finalize-direction-review"
        : END,
    ["finalize-direction-review", END]
  );
  graph.addConditionalEdges(
    "finalize-direction-review",
    (state) =>
      state.directionGovernanceResult?.status === "revision-requested"
        ? "run-ceo-synthesis"
        : END,
    ["run-ceo-synthesis", END]
  );

  // No automatic retry. Memory checkpoints support only same-process Human Resume;
  // persisted Governance records remain the approval authority.
  // 3. Compile Graph
  // The finite Assignment cursor bounds repetition. LangGraph's default 25 steps
  // must not become an additional Invocation budget; callers may set a lower limit.
  return graph
    .compile(humanGovernance ? { checkpointer: new MemorySaver() } : {})
    .withConfig({ recursionLimit: Number.MAX_SAFE_INTEGER });
}
