import { humanDirectionReview } from "./features/governance/nodes/direction-review/human-direction-review.js";
import {
  createFinalizeDirectionReviewNode,
  type DirectionConfirmationOptions,
} from "./features/governance/nodes/direction-review/finalize-direction-review.js";
import { createRunCEOSynthesisNode } from "./features/decision-support/synthesis/nodes/run-ceo-synthesis.js";
import type { RunSynthesisOptions } from "@/application/management/decision-support/synthesis/index.js";
import type { ExecutionDelegationProposalAgent } from "@/application/governance/index.js";
import { END, START, StateGraph, MemorySaver } from "@langchain/langgraph";
import { phaseAState } from "./state.js";
import {
  createRunStaffingNode,
  type StaffingExecutionOptions,
} from "./features/analysis-assignment/nodes/run-staffing.js";
import { evaluateStaffingApproval } from "./features/governance/nodes/staffing-approval/evaluate-staffing-approval.js";
import { loadSystemPolicy } from "./features/governance/nodes/system-policy/load-system-policy.js";
import {
  createConfirmStaffingApprovalNode,
  type StaffingConfirmationOptions,
} from "./features/governance/nodes/staffing-approval/confirm-staffing-approval.js";

import { preflightSpecialistDecisionsNode } from "./features/specialist-analysis/nodes/preflight-specialist-decisions.js";
import { executeNextSpecialist } from "./features/specialist-analysis/nodes/execute-next-specialist.js";
import { compareSpecialistDecisions } from "./features/decision-support/comparison/nodes/compare-specialist-decisions.js";
import type { AssessmentAgent } from "@/application/management/decision-support/analysis-review/index.js";
import { createAssessAnalysisNode } from "./features/decision-support/analysis-review/nodes/assess-analysis.js";
import { createConfirmRefinementNode } from "./features/decision-support/analysis-review/nodes/confirm-refinement.js";
import { prepareRefinementNode } from "./features/decision-support/analysis-review/nodes/prepare-refinement.js";

import {
  routeAfterStaffingApproval,
  routeAfterSpecialistExecution,
  routeAfterComparison,
  routeAfterSynthesis,
} from "./routing.js";

export type PhaseAGraphOptions = StaffingExecutionOptions &
  StaffingConfirmationOptions &
  DirectionConfirmationOptions & {
    directionApproval?: "joint" | "direction-only";
    synthesis?: RunSynthesisOptions;
    executionDelegationProposalAgent?: ExecutionDelegationProposalAgent;
    assessmentAgent?: AssessmentAgent;
  };

export function createPhaseAGraph(options: PhaseAGraphOptions = {}) {
  const requireHandoff = options.directionApproval !== "direction-only";

  // 1. Register Workflow Nodes
  const graph = new StateGraph(phaseAState)
    .addNode("load-system-policy", loadSystemPolicy)
    .addNode("run-staffing", createRunStaffingNode(options))
    .addNode("evaluate-staffing-approval", evaluateStaffingApproval)
    .addNode("preflight-specialist-decisions", preflightSpecialistDecisionsNode)
    .addNode("execute-next-specialist", executeNextSpecialist)
    .addNode("compare-specialist-decisions", compareSpecialistDecisions)
    .addNode(
      "assess-analysis",
      createAssessAnalysisNode(options.assessmentAgent)
    )
    .addNode("prepare-refinement", prepareRefinementNode)
    .addNode(
      "run-ceo-synthesis",
      createRunCEOSynthesisNode(options.synthesis, {
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
    )
    .addNode(
      "confirm-staffing-approval",
      createConfirmStaffingApprovalNode(options.confirmApproval)
    )
    .addNode(
      "confirm-refinement",
      createConfirmRefinementNode(options.confirmApproval)
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
    "prepare-refinement",
    (state) =>
      state.analysisRefinement?.status === "approval-required"
        ? "confirm-refinement"
        : state.analysisRefinement?.status === "ready"
          ? "execute-next-specialist"
          : END,
    ["confirm-refinement", "execute-next-specialist", END]
  );
  graph.addConditionalEdges(
    "confirm-refinement",
    (state) =>
      state.analysisRefinement?.status === "ready"
        ? "execute-next-specialist"
        : END,
    ["execute-next-specialist", END]
  );
  graph.addConditionalEdges(
    "evaluate-staffing-approval",
    (state) =>
      state.approvalResult?.status === "approval-required"
        ? "confirm-staffing-approval"
        : routeAfterStaffingApproval(state),
    ["confirm-staffing-approval", "preflight-specialist-decisions", END]
  );
  graph.addConditionalEdges(
    "confirm-staffing-approval",
    (state) => routeAfterStaffingApproval(state),
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
  // Stage 4 failure never enters Synthesis, and only supported analysis reaches Synthesis.
  graph.addConditionalEdges(
    "compare-specialist-decisions",
    routeAfterComparison,
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
    (state) => routeAfterSynthesis(state, requireHandoff),
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
    .compile({ checkpointer: new MemorySaver() })
    .withConfig({ recursionLimit: Number.MAX_SAFE_INTEGER });
}
