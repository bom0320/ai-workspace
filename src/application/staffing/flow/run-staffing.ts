import { assertContextBudget } from "./inspection/context-policy.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";

import type { StaffingProposalPolicy } from "../model/policy.js";
import type { StaffingRunResult } from "../model/result.js";
import { staffingDraftSchema } from "../protocol/ceo.js";
import {
  runStaffingLoop,
  type StaffingLoopOptions,
} from "./orchestration/run-staffing-loop.js";
import { buildStaffingProposal } from "./transformation/build-staffing-proposal.js";
import {
  prepareProposalInput,
  validateProposal,
  ProposalPolicyError,
  type RunStaffingOptions,
} from "./validation/validate-proposal.js";

export type { RunStaffingOptions } from "./validation/validate-proposal.js";

export async function runStaffing(
  options: RunStaffingOptions
): Promise<StaffingRunResult> {
  let runOptions: StaffingLoopOptions;
  let policy: StaffingProposalPolicy;
  try {
    ({ runOptions, policy } = prepareProposalInput(options));
  } catch {
    return {
      status: "failed",
      failure: "invalid-input",
      reason: "Invalid Harness proposal policy or run inputs.",
      rounds: 0,
    };
  }

  const result = await runStaffingLoop(runOptions);
  if (result.status !== "proposed") return result;
  const { state, rounds } = result;
  const drift = (): StaffingRunResult => ({
    status: "failed",
    failure: "snapshot-drift",
    reason: "Repository no longer matches the staffing Run Snapshot.",
    rounds,
  });
  try {
    assertRepositoryMatchesSnapshot(state.snapshot);
  } catch {
    return drift();
  }
  try {
    const draft = staffingDraftSchema.parse(result.draft);
    const inspectedFiles = validateProposal(
      draft,
      {
        goal: state.context.goal,
        snapshot: state.snapshot,
        files: state.files,
        fileTree: state.context.repository.fileTree,
        contextAccessPolicy: state.contextAccessPolicy,
        specialists: runOptions.availableSpecialists,
        limits: state.context.limits,
      },
      policy
    );
    // Preserve the actual CEO metadata/projection budget independently of the
    // assignment budget. No reconstructed inspection state is needed elsewhere.
    assertContextBudget({ ...state.context, inspectedFiles });
    assertRepositoryMatchesSnapshot(state.snapshot);
    const proposal = buildStaffingProposal(draft, state);
    assertRepositoryMatchesSnapshot(state.snapshot);
    return {
      status: "proposed",
      proposal,
      rounds,
    };
  } catch (error) {
    try {
      assertRepositoryMatchesSnapshot(state.snapshot);
    } catch {
      return drift();
    }
    // Policy diagnostics below contain no supplied paths, content or root.
    return {
      status: "failed",
      failure: "policy-validation",
      reason:
        error instanceof ProposalPolicyError
          ? error.message
          : "Staffing proposal validation failed.",
      rounds,
    };
  }
}
