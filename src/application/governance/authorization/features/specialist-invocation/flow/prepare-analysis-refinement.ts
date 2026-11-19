import { randomUUID } from "node:crypto";
import { listRepositoryFilesAtCommit } from "@/infrastructure/git/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { isContextScopeContained } from "@/services/repository-inspection/index.js";
import {
  buildStaffingProposal,
  staffingDraftSchema,
  type StaffingAssignment,
  type StaffingProposal,
} from "@/application/staffing/index.js";
import type {
  AssessmentInput,
  AssessmentLimits,
  AssessmentResult,
} from "@/application/analysis-assessment/index.js";
import { requireCurrentSystemRecord } from "../../../../approval/features/system-policy/flow/validation/system-configuration.js";
import { withGovernanceLedger } from "../../../../records/governance-transaction.js";
import type { ApprovedOperatingScope } from "../../../../model/authority.js";
import {
  assertRefinementAvailable,
  remainingAnalysisBudget,
  requireAnalysisRoot,
  verifyAnalysisSources,
} from "./validation/validate-analysis-refinement.js";
import {
  analysisRefinementSchema,
  MAX_ANALYSIS_REFINEMENTS,
  type AnalysisRefinement,
} from "../model/analysis-refinement.js";

// Internal integration used only with a verified Assessment on the Phase A path.
export function prepareAnalysisRefinement(
  rootScopeId: string,
  basis: AssessmentInput,
  invocationIds: string[],
  result: Extract<AssessmentResult, { status: "refinement-required" }>
):
  | { status: "ready"; round: AnalysisRefinement }
  | { status: "proposal-required"; proposal: StaffingProposal } {
  return withGovernanceLedger((ledger, save) => {
    const entry = Object.values(ledger.repositories).find((repository) =>
      repository.issuances.some(({ scope }) => scope.id === rootScopeId)
    );
    if (!entry) throw new Error("Initial analysis Scope unavailable.");
    const root = requireAnalysisRoot(entry, rootScopeId);
    const current = verifyAnalysisSources(
      entry,
      rootScopeId,
      basis,
      invocationIds,
      true
    );
    const { snapshot } = root.scope;
    const policy = requireCurrentSystemRecord(
      entry.systems.at(-1)!,
      snapshot.repositoryRoot
    );
    const bySpecialist = new Map(
      current.map((source) => [source.assignment.specialistId, source])
    );
    const changed = new Map<string, Omit<StaffingAssignment, "assignmentId">>();
    const operations = new Set<string>();
    const files = result.changes.some((change) => "context" in change)
      ? listRepositoryFilesAtCommit(snapshot.repositoryRoot, snapshot.commitSha)
      : [];

    for (const change of result.changes) {
      const key = governanceDigest([change.kind, change.specialistId]);
      const prior = bySpecialist.get(change.specialistId);
      if (
        operations.has(key) ||
        !policy.availableSpecialists.some(
          ({ id }) => id === change.specialistId
        ) ||
        (change.kind === "specialist-addition") !== !prior
      )
        throw new Error("Unknown or duplicate Specialist change.");
      operations.add(key);
      const draft = changed.get(change.specialistId) ?? {
        specialistId: change.specialistId,
        objective: prior?.assignment.objective ?? "",
        contextPaths: [...(prior?.assignment.contextPaths ?? [])],
        rationale: change.reason,
      };
      if ("objective" in change && change.objective)
        draft.objective = change.objective;
      if ("context" in change) {
        for (const scope of change.context) {
          if (!isContextScopeContained(scope, policy.contextAccessPolicy))
            throw new Error("Context request exceeds System Policy.");
          const paths = files
            .filter(
              ({ path, mode, size }) =>
                (mode === "100644" || mode === "100755") &&
                size !== null &&
                size <= policy.limits.maxFileBytes &&
                (scope.kind === "file"
                  ? path === scope.path
                  : path.startsWith(`${scope.path}/`))
            )
            .map(({ path }) => path);
          if (!paths.length)
            throw new Error(
              "Context scope contains no permitted regular file."
            );
          draft.contextPaths = [...new Set([...draft.contextPaths, ...paths])];
        }
      }
      changed.set(change.specialistId, draft);
    }
    const assignments = [...changed.values()];
    const changeDigest = governanceDigest(
      assignments
        .map(({ specialistId, objective, contextPaths }) => {
          return {
            specialistId,
            objective,
            contextPaths: [...contextPaths].sort(),
          };
        })
        .sort((a, b) => a.specialistId.localeCompare(b.specialistId))
    );
    const binding = {
      id: randomUUID(),
      rootScopeId,
      basisDigest: governanceDigest(basis),
      assessmentDigest: governanceDigest(result),
      changeDigest,
    };
    assertRefinementAvailable(
      entry,
      rootScopeId,
      changeDigest,
      assignments.length
    );

    const requests = assignments.map(
      ({ specialistId, objective, contextPaths }) => {
        const cached = bySpecialist.get(specialistId);
        if (
          !cached ||
          objective !== cached.assignment.objective ||
          !contextPaths.every((path) =>
            cached.assignment.contextPaths.includes(path)
          )
        )
          return;
        return {
          scopeId: cached.scope.id,
          scopeVersion: cached.scope.version,
          assignmentId: cached.assignment.assignmentId,
          requestedContextPaths: contextPaths,
        };
      }
    );
    if (
      requests.every((request) => request !== undefined) &&
      requests.every(({ scopeId }) => scopeId === requests[0].scopeId)
    ) {
      const scope = entry.issuances.find(
        ({ scope }) => scope.id === requests[0].scopeId
      )!.scope;
      const reserved = (entry.reservations ?? []).filter(
        ({ scopeId }) => scopeId === scope.id
      ).length;
      if (reserved + requests.length <= scope.budget.maxAgentInvocations) {
        const round = analysisRefinementSchema.parse({ ...binding, requests });
        (entry.analysisRefinements ??= []).push(round);
        save();
        return { status: "ready", round };
      }
    }

    const draft = staffingDraftSchema.parse({
      intent: root.proposal.intent,
      assignments,
      rationale: result.reason,
      budget: { maxAgentInvocations: assignments.length },
    });
    const proposal = buildStaffingProposal(draft, root.scope.goal, snapshot);
    return {
      status: "proposal-required",
      proposal: { ...proposal, refinement: binding },
    };
  });
}

export function projectRefinementRequests(scope: ApprovedOperatingScope) {
  return scope.assignments.map(({ assignmentId, contextPaths }) => ({
    scopeId: scope.id,
    scopeVersion: scope.version,
    assignmentId,
    requestedContextPaths: contextPaths,
  }));
}

export function assertCurrentAnalysis(
  rootScopeId: string,
  basis: AssessmentInput,
  invocationIds: string[]
): AssessmentLimits {
  return withGovernanceLedger((ledger) => {
    const entries = Object.values(ledger.repositories).filter((entry) =>
      entry.issuances.some(({ scope }) => scope.id === rootScopeId)
    );
    if (entries.length !== 1)
      throw new Error("Initial analysis Scope unavailable.");
    verifyAnalysisSources(entries[0], rootScopeId, basis, invocationIds, true);
    return {
      remainingInvocations: remainingAnalysisBudget(entries[0], rootScopeId),
      remainingRefinements:
        MAX_ANALYSIS_REFINEMENTS -
        (entries[0].analysisRefinements ?? []).filter(
          (round) => round.rootScopeId === rootScopeId
        ).length,
    };
  });
}
