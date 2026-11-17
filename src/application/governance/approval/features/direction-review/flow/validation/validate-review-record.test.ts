import type { ApprovedOperatingScope } from "../../../../../model/authority.js";
import { describe, expect, it } from "vitest";
import type {
  SynthesisContext,
  SynthesisProposal,
} from "@/application/synthesis/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import type { DirectionReview } from "../../model/review.js";
import {
  assertReviewNotRegistered,
  assertAnalysisScope,
  validateRevisionRequest,
} from "./validate-review-record.js";

const context: SynthesisContext = {
  goal: {
    objective: "Review UI",
    targetRepository: "repo",
    constraints: ["No edits"],
  },
  repositoryCommitSha: "abc",
  assignments: [
    {
      assignmentId: "assignment",
      specialistId: "frontend",
      objective: "Review UI",
    },
  ],
  decisions: [
    {
      specialistId: "frontend",
      recommendation: "Preserve behavior",
      evidence: [],
      risks: [],
      uncertainty: [],
    },
  ],
  comparison: { status: "skipped", reason: "insufficient-decisions" },
};
const statement = {
  text: "Preserve behavior",
  sources: [{ kind: "recommendation" as const, specialistId: "frontend" }],
};
const proposal: SynthesisProposal = {
  direction: statement,
  rationale: [statement],
  alternatives: [],
  tradeoffs: [],
  risks: [],
  unresolvedIssues: [],
  humanReviewItems: [statement],
};

// Record integrity is checked by the resolver before these pure registration rules.
function previousReview(): DirectionReview {
  return {
    id: "previous",
    scopeId: "scope",
    scopeVersion: 1,
    analysisDigest: governanceDigest(context),
    proposal: structuredClone(proposal),
    revision: 0,
    binding: "binding",
    resolution: {
      id: "resolution",
      action: {
        reviewId: "previous",
        binding: "binding",
        action: "request-revision",
        feedback: "Clarify risks",
      },
      confirmationBinding: "confirmation-binding",
      confirmation: {
        id: "receipt",
        uid: 0,
        confirmedAt: "2026-01-01T00:00:00.000Z",
      },
      resolvedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}
type RevisionRequest = Parameters<typeof validateRevisionRequest>[0];
function revisionRequest(): RevisionRequest {
  const previous = previousReview();
  return {
    scopeId: "scope",
    context: structuredClone(context),
    revision: {
      previousProposal: structuredClone(previous.proposal),
      feedback: "Clarify risks",
    },
    previousReviewId: previous.id,
    previousReview: previous,
  };
}

describe("Direction Review registration validation", () => {
  it("starts an initial Review at round zero and accepts two recorded revisions", () => {
    expect(
      validateRevisionRequest({
        scopeId: "scope",
        context,
        revision: undefined,
      })
    ).toBe(0);
    const request = revisionRequest();
    expect(validateRevisionRequest(request)).toBe(1);
    request.previousReview!.revision = 1;
    expect(validateRevisionRequest(request)).toBe(2);
  });
  it("rejects revision input without a recorded parent request", () => {
    const request = revisionRequest();
    delete request.previousReviewId;
    expect(() => validateRevisionRequest(request)).toThrow(
      "requires a recorded Human request"
    );
  });

  const invalid: [string, (request: RevisionRequest) => void][] = [
    [
      "missing parent",
      (request) => {
        request.previousReview = undefined;
      },
    ],
    [
      "different Scope",
      (request) => {
        request.previousReview!.scopeId = "other";
      },
    ],
    [
      "unresolved parent",
      (request) => {
        delete request.previousReview!.resolution;
      },
    ],
    [
      "approved parent",
      (request) => {
        request.previousReview!.resolution!.action = {
          reviewId: "previous",
          binding: "binding",
          action: "approve",
        };
      },
    ],
    [
      "third revision",
      (request) => {
        request.previousReview!.revision = 2;
      },
    ],
    [
      "changed analysis",
      (request) => {
        request.context.decisions[0].recommendation = "Different analysis";
      },
    ],
    [
      "missing revision input",
      (request) => {
        request.revision = undefined;
      },
    ],
    [
      "changed previous Proposal",
      (request) => {
        request.revision!.previousProposal.direction.text =
          "Different direction";
      },
    ],
    [
      "changed Human feedback",
      (request) => {
        request.revision!.feedback = "Unrecorded feedback";
      },
    ],
  ];
  it.each(invalid)("rejects %s", (_name, mutate) => {
    const request = revisionRequest();
    mutate(request);
    expect(() => validateRevisionRequest(request)).toThrow(
      "Revision does not match Human feedback"
    );
  });

  it("rejects analysis whose Goal differs from the approved Scope", () => {
    const scope: ApprovedOperatingScope = {
      id: "scope",
      version: 1,
      proposalId: "staffing-proposal",
      approvalRecordId: "staffing-approval",
      policyVersion: "system:1",
      goal: structuredClone(context.goal),
      snapshot: {
        repositoryRoot: "/repo",
        commitSha: context.repositoryCommitSha,
      },
      assignments: context.assignments.map((assignment) => ({
        ...assignment,
        contextPaths: ["a.ts"],
      })),
      budget: { maxAgentInvocations: 1 },
    };
    expect(() => assertAnalysisScope(context, scope)).not.toThrow();
    scope.goal.objective = "Different approved Goal";
    expect(() => assertAnalysisScope(context, scope)).toThrow(
      "does not match the approved Scope"
    );
  });

  it("rejects a second initial Review for the same Scope", () => {
    expect(() =>
      assertReviewNotRegistered([previousReview()], "scope")
    ).toThrow("already been registered");
    expect(() => assertReviewNotRegistered(undefined, "scope")).not.toThrow();
    expect(() =>
      assertReviewNotRegistered([previousReview()], "other")
    ).not.toThrow();
  });
  it("rejects a second child for the same parent while allowing another revision parent", () => {
    const child = {
      ...previousReview(),
      id: "child",
      previousReviewId: "previous",
      revision: 1,
    };
    expect(() =>
      assertReviewNotRegistered([child], "scope", "previous")
    ).toThrow("already been registered");
    expect(() =>
      assertReviewNotRegistered([child], "scope", "child")
    ).not.toThrow();
  });
});
