import { randomUUID } from "node:crypto";
import { governanceDigest } from "@/services/governance-records/index.js";
import {
  normalizeRefinementChanges,
  buildRefinementProposal,
} from "@/application/analysis-refinement/index.js";
import type { StaffingProposal } from "@/application/staffing/index.js";
import type {
  AssessmentInput,
  AssessmentResult,
} from "@/application/analysis-assessment/index.js";
import { requireCurrentSystemRecord } from "../../approval/features/system-policy/flow/validation/system-configuration.js";
import { withGovernanceLedger } from "../governance-transaction.js";
import { requireAnalysisRoot } from "./analysis-budget.js";
import {
  assertRefinementAvailable,
  verifyAnalysisSources,
} from "./analysis-provenance.js";
import {
  analysisRefinementSchema,
  type AnalysisRefinement,
} from "../../model/analysis-refinement.js";

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
    const assignments = normalizeRefinementChanges(
      result,
      current.map(({ assignment }) => assignment),
      snapshot,
      policy
    );
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

    const proposal = buildRefinementProposal(
      assignments,
      result.reason,
      root.proposal.intent,
      root.scope.goal,
      snapshot
    );
    return {
      status: "proposal-required",
      proposal: { ...proposal, refinement: binding },
    };
  });
}
