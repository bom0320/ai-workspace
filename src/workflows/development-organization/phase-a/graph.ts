import { humanDirectionReview } from "./features/governance/nodes/direction-review/human-direction-review.js";
import {
  createFinalizeDirectionReviewNode,
  type DirectionConfirmationOptions,
} from "./features/governance/nodes/direction-review/finalize-direction-review.js";
import { createRunCEOSynthesisNode } from "./features/synthesis/nodes/run-ceo-synthesis.js";
import type { RunSynthesisOptions } from "@/application/management/decision-support/synthesis/index.js";
import type { ExecutionDelegationProposalAgent } from "@/application/governance/index.js";
import { END, START, StateGraph, MemorySaver } from "@langchain/langgraph";
import { phaseAState } from "./state.js";
import {
  createRunStaffingNode,
  type StaffingExecutionOptions,
} from "./features/staffing/nodes/run-staffing.js";
import { evaluateStaffingApproval } from "./features/governance/nodes/staffing-approval/evaluate-staffing-approval.js";
import { loadSystemPolicy } from "./features/governance/nodes/system-policy/load-system-policy.js";
import {
  createConfirmStaffingApprovalNode,
  type StaffingConfirmationOptions,
} from "./features/governance/nodes/staffing-approval/confirm-staffing-approval.js";

import { preflightSpecialistDecisionsNode } from "./features/decision/nodes/preflight-specialist-decisions.js";
import { executeNextSpecialist } from "./features/decision/nodes/execute-next-specialist.js";
import { compareSpecialistDecisions } from "./features/comparison/nodes/compare-specialist-decisions.js";
import type { AssessmentAgent } from "@/application/management/decision-support/analysis-review/index.js";
import { createAssessAnalysisNode } from "./features/analysis/nodes/assess-analysis.js";
import { createConfirmRefinementNode } from "./features/analysis/nodes/confirm-refinement.js";
import { prepareRefinementNode } from "./features/analysis/nodes/prepare-refinement.js";

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
    allowDirectStaffingApproval?: boolean;
    synthesis?: RunSynthesisOptions;
    executionDelegationProposalAgent?: ExecutionDelegationProposalAgent;
    assessmentAgent?: AssessmentAgent;
  };

export function createPhaseAGraph(options: PhaseAGraphOptions = {}) {
  const {
    executionTarget = "staffing-approval",
    allowDirectStaffingApproval = false,
  } = options;

  const requireHandoff = executionTarget === "human-direction-governance";
  const humanGovernance =
    requireHandoff || executionTarget === "independent-direction-review";
  const trackAnalysis = humanGovernance || executionTarget === "ceo-synthesis";

  // 1. Register Workflow Nodes
  const graph = new StateGraph(phaseAState)
    .addNode("load-system-policy", (state) =>
      loadSystemPolicy(state, !allowDirectStaffingApproval)
    )
    .addNode("run-staffing", createRunStaffingNode(options))
    .addNode("evaluate-staffing-approval", evaluateStaffingApproval)
    .addNode("preflight-specialist-decisions", preflightSpecialistDecisionsNode)
    .addNode("execute-next-specialist", (state) =>
      executeNextSpecialist(state, trackAnalysis)
    )
    .addNode("compare-specialist-decisions", compareSpecialistDecisions)
    .addNode(
      "assess-analysis",
      createAssessAnalysisNode(options.assessmentAgent)
    )
    .addNode("prepare-refinement", prepareRefinementNode)
    .addNode(
      "run-ceo-synthesis",
      createRunCEOSynthesisNode(options.synthesis, {
        directionReview: humanGovernance,
        requireHandoff,
        executionDelegationProposalAgent:
          options.executionDelegationProposalAgent,
      })
    )
    .addNode("human-direction-review", (state) =>
      humanDirectionReview(state, requireHandoff)
    )
    .addNode(
      "finalize-direction-review",
      createFinalizeDirectionReviewNode(
        options.confirmDirection,
        requireHandoff
      )
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
  if (allowDirectStaffingApproval) {
    const compatibilityGraph = graph
      .addNode(
        "confirm-staffing-approval",
        createConfirmStaffingApprovalNode(options.confirmApproval)
      )
      .addNode(
        "confirm-refinement",
        createConfirmRefinementNode(options.confirmApproval)
      );
    compatibilityGraph.addConditionalEdges(
      "prepare-refinement",
      (state) =>
        state.analysisRefinement?.status === "approval-required"
          ? "confirm-refinement"
          : state.analysisRefinement?.status === "ready"
            ? "execute-next-specialist"
            : END,
      ["confirm-refinement", "execute-next-specialist", END]
    );
    compatibilityGraph.addConditionalEdges(
      "confirm-refinement",
      (state) =>
        state.analysisRefinement?.status === "ready"
          ? "execute-next-specialist"
          : END,
      ["execute-next-specialist", END]
    );
    compatibilityGraph.addConditionalEdges(
      "evaluate-staffing-approval",
      (state) =>
        state.approvalResult?.status === "approval-required"
          ? "confirm-staffing-approval"
          : routeAfterStaffingApproval(state, executionTarget),
      ["confirm-staffing-approval", "preflight-specialist-decisions", END]
    );
    compatibilityGraph.addConditionalEdges(
      "confirm-staffing-approval",
      (state) => routeAfterStaffingApproval(state, executionTarget),
      ["preflight-specialist-decisions", END]
    );
  } else {
    graph.addConditionalEdges(
      "prepare-refinement",
      (state) =>
        state.analysisRefinement?.status === "ready"
          ? "execute-next-specialist"
          : END,
      ["execute-next-specialist", END]
    );
    graph.addConditionalEdges(
      "evaluate-staffing-approval",
      (state) => routeAfterStaffingApproval(state, executionTarget),
      ["preflight-specialist-decisions", END]
    );
  }
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
    ["assess-analysis", END]
  );
  graph.addConditionalEdges(
    "assess-analysis",
    (state) =>
      state.analysisAssessment?.status === "sufficient"
        ? "run-ceo-synthesis"
        : state.analysisAssessment?.status === "refinement-required"
          ? "prepare-refinement"
          : END,
    ["run-ceo-synthesis", "prepare-refinement", END]
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
