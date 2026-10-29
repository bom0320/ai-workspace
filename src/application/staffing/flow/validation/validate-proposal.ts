import { specialistDefinitionSchema } from "@/contracts/specialist.js";
import { readRepositoryFileAtCommit } from "@/infrastructure/git/index.js";
import { isUnambiguousRepositoryPath } from "@/services/repository-inspection/index.js";

import type { StaffingContextState } from "../../model/state.js";
import {
  staffingProposalPolicySchema,
  type StaffingProposalPolicy,
} from "../../model/policy.js";
import type { StaffingDraft } from "../../protocol/ceo.js";
import type { StaffingLoopOptions } from "../orchestration/run-staffing-loop.js";
import {
  assertContextBudget,
  byteLength,
  isInspectablePath,
  requireFile,
} from "../inspection/context-policy.js";

export type RunStaffingOptions = StaffingLoopOptions & {
  policy: StaffingProposalPolicy;
};

export class ProposalPolicyError extends Error {}

// Internal validation; public finalization accepts only the private Loop result.
export function validateProposal(
  draft: StaffingDraft,
  state: StaffingContextState,
  specialists: StaffingLoopOptions["availableSpecialists"],
  policy: StaffingProposalPolicy
): string[] {
  if (draft.budget.maxAgentInvocations > policy.maxAgentInvocations)
    throw new ProposalPolicyError(
      "Proposed invocation budget exceeds Harness policy."
    );
  const ids = draft.assignments.map((assignment) => assignment.specialistId);
  // Phase A has one analysis assignment per Specialist. Repeated delegation
  // requires a future explicit model, not ambiguous duplicate assignments.
  if (new Set(ids).size !== ids.length)
    throw new ProposalPolicyError(
      "Duplicate Specialist assignments are not allowed."
    );
  for (const id of ids) {
    const specialist = specialists.find((candidate) => candidate.id === id);
    if (!specialist)
      throw new ProposalPolicyError(
        "Assignment refers to an unregistered Specialist."
      );
    if (
      specialist.authority.repositoryAccess !== "read" ||
      specialist.authority.shellExecution
    )
      throw new ProposalPolicyError(
        "Phase A analysis requires read-only, shell-disabled Specialist authority."
      );
  }

  const paths = new Set<string>();
  const { limits } = state.context;
  for (const assignment of draft.assignments) {
    if (assignment.contextPaths.length > limits.maxFilesPerRequest)
      throw new ProposalPolicyError(
        "Assignment Context exceeds maxFilesPerRequest."
      );
    if (
      new Set(assignment.contextPaths).size !== assignment.contextPaths.length
    )
      throw new ProposalPolicyError(
        "Duplicate assignment Context paths are not allowed."
      );
    for (const path of assignment.contextPaths) {
      if (
        !isInspectablePath(path) ||
        !state.allowedContextPaths.includes(path) ||
        !state.context.repository.fileTree.includes(path)
      )
        throw new ProposalPolicyError(
          "Assignment Context is outside the permitted Snapshot file scope."
        );
      requireFile(state.files, path, limits);
      paths.add(path);
    }
  }
  if (paths.size > limits.maxTotalFiles)
    throw new ProposalPolicyError("Proposal Context exceeds maxTotalFiles.");

  for (const rule of policy.constraintRules) {
    if (
      rule.type === "context-paths" &&
      [...paths].some((path) => !rule.allowedContextPaths.includes(path))
    )
      throw new ProposalPolicyError(
        "Proposal violates a structured Human Context constraint."
      );
    if (
      rule.type === "specialists" &&
      ids.some((id) => !rule.allowedSpecialistIds.includes(id))
    )
      throw new ProposalPolicyError(
        "Proposal violates a structured Human Specialist constraint."
      );
    if (
      rule.type === "invocation-budget" &&
      draft.budget.maxAgentInvocations > rule.maxAgentInvocations
    )
      throw new ProposalPolicyError(
        "Proposal violates a structured Human invocation budget constraint."
      );
  }

  // Preflight the full union before reading any blob; never trust Working Tree
  // content or a CEO-supplied file. Assignment Context limits don't consume CEO
  // inspection rounds or mutate the run's inspection state.
  const projection = { ...state.context, inspectedFiles: [] };
  const bytes = [...paths].reduce(
    (sum, path) => sum + requireFile(state.files, path, limits).size!,
    0
  );
  if (byteLength(projection) + bytes > limits.maxContextBytes)
    throw new ProposalPolicyError("Proposal Context exceeds maxContextBytes.");
  const inspectedFiles = [...paths].map((path) => ({
    path,
    content: readRepositoryFileAtCommit(
      state.snapshot.repositoryRoot,
      state.snapshot.commitSha,
      path
    ),
  }));
  assertContextBudget({ ...projection, inspectedFiles });
  return (state.context.goal.constraints ?? []).filter(
    (constraint) =>
      !policy.constraintRules.some((rule) => rule.constraint === constraint)
  );
}

export function prepareProposalInput(options: RunStaffingOptions) {
  // Capture Harness input before the first await; a caller or injected Agent
  // mutating options later cannot replace this run's registration or policy.
  const { agent, policy: suppliedPolicy, ...input } = options;
  const runOptions = { ...structuredClone(input), agent };
  const policy = staffingProposalPolicySchema.parse(suppliedPolicy);
  runOptions.availableSpecialists = specialistDefinitionSchema
    .array()
    .parse(runOptions.availableSpecialists);
  for (const rule of policy.constraintRules) {
    if (!runOptions.goal.constraints?.includes(rule.constraint))
      throw new ProposalPolicyError(
        "Rule is not bound to an original Human constraint."
      );
    if (
      rule.type === "context-paths" &&
      rule.allowedContextPaths.some(
        (path) => !isUnambiguousRepositoryPath(path)
      )
    )
      throw new ProposalPolicyError("Invalid structured Context constraint.");
  }
  return { runOptions, policy };
}
