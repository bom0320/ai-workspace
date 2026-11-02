import { specialistDefinitionSchema } from "@/contracts/specialist.js";
import { readRepositoryFileAtCommit } from "@/infrastructure/git/index.js";
import { isUnambiguousRepositoryPath } from "@/services/repository-inspection/index.js";

import type { RepositorySnapshot } from "@/contracts/repository-snapshot.js";
import type { SpecialistDefinition } from "@/contracts/specialist.js";
import type { GoalSpec } from "@/contracts/goal.js";
import type { CommitFile } from "@/infrastructure/git/index.js";
import type { StaffingInspectionLimits } from "../../protocol/context.js";
import {
  staffingProposalPolicySchema,
  type StaffingProposalPolicy,
} from "../../model/policy.js";
import type { StaffingDraft } from "../../protocol/ceo.js";
import type { StaffingLoopOptions } from "../orchestration/run-staffing-loop.js";
import {
  isInspectablePath,
  requireFile,
} from "../inspection/context-policy.js";

export type RunStaffingOptions = StaffingLoopOptions & {
  policy: StaffingProposalPolicy;
};

export class ProposalPolicyError extends Error {}

// Snapshot facts and Harness policy, independent of CEO inspection history.
export type ProposalValidationContext = {
  goal: GoalSpec;
  snapshot: RepositorySnapshot;
  files: CommitFile[];
  fileTree: string[];
  allowedContextPaths: string[];
  specialists: SpecialistDefinition[];
  limits: StaffingInspectionLimits;
};

// Public finalization still accepts only the private Loop result.
export function validateProposal(
  draft: StaffingDraft,
  context: ProposalValidationContext,
  policy: StaffingProposalPolicy
) {
  const { specialists, limits } = context;
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
        !context.allowedContextPaths.includes(path) ||
        !context.fileTree.includes(path)
      )
        throw new ProposalPolicyError(
          "Assignment Context is outside the permitted Snapshot file scope."
        );
      requireFile(context.files, path, limits);
      paths.add(path);
    }
  }
  if (paths.size > limits.maxTotalFiles)
    throw new ProposalPolicyError("Proposal Context exceeds maxTotalFiles.");

  for (const rule of policy.enforcementRules) {
    if (
      rule.type === "context-paths" &&
      [...paths].some((path) => !rule.allowedContextPaths.includes(path))
    )
      throw new ProposalPolicyError(
        "Proposal violates Harness Context policy."
      );
    if (
      rule.type === "specialists" &&
      ids.some((id) => !rule.allowedSpecialistIds.includes(id))
    )
      throw new ProposalPolicyError(
        "Proposal violates Harness Specialist policy."
      );
    if (
      rule.type === "invocation-budget" &&
      draft.budget.maxAgentInvocations > rule.maxAgentInvocations
    )
      throw new ProposalPolicyError(
        "Proposal violates Harness invocation budget policy."
      );
  }

  // Preflight the full union before reading any blob; never trust Working Tree
  // content or a CEO-supplied file. Assignment Context limits don't consume CEO
  // inspection rounds or mutate the run's inspection state.
  // Assignment budget measures a deterministic validation envelope, not a
  // reconstructed CEO Context. Include the full Harness configuration and file
  // tree as well as proposal data; JSON escaping counts toward the same cap.
  const { files: _commitFiles, ...facts } = context;
  const projection = {
    ...facts,
    policy,
    // Exclude Harness-issued IDs and Proposal wrapper fields so Draft and
    // Proposal revalidation measure exactly the same assignment payload.
    draft: {
      intent: draft.intent,
      assignments: draft.assignments.map(
        ({ specialistId, objective, contextPaths, rationale }) => ({
          specialistId,
          objective,
          contextPaths,
          rationale,
        })
      ),
      budget: draft.budget,
      rationale: draft.rationale,
    },
    inspectedFiles: [] as { path: string; content: string }[],
  };
  const byteLength = (value: unknown) =>
    Buffer.byteLength(JSON.stringify(value), "utf8");
  const bytes = [...paths].reduce(
    (sum, path) => sum + requireFile(context.files, path, limits).size!,
    0
  );
  if (byteLength(projection) + bytes > limits.maxContextBytes)
    throw new ProposalPolicyError("Proposal Context exceeds maxContextBytes.");
  const inspectedFiles = [...paths].map((path) => ({
    path,
    content: readRepositoryFileAtCommit(
      context.snapshot.repositoryRoot,
      context.snapshot.commitSha,
      path
    ),
  }));
  if (byteLength({ ...projection, inspectedFiles }) > limits.maxContextBytes)
    throw new ProposalPolicyError("Proposal Context exceeds maxContextBytes.");
  return inspectedFiles;
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
  for (const rule of policy.enforcementRules) {
    if (
      rule.type === "context-paths" &&
      rule.allowedContextPaths.some(
        (path) => !isUnambiguousRepositoryPath(path)
      )
    )
      throw new ProposalPolicyError("Invalid Harness Context policy.");
  }
  return { runOptions, policy };
}
