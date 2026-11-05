import { resolveContextAccessPolicy } from "@/services/repository-inspection/index.js";
import { z } from "zod";
import { listRepositoryFilesAtCommit } from "@/infrastructure/git/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import { staffingProposalSchema } from "../../model/staffing.js";
import { staffingSystemPolicySchema } from "@/contracts/staffing-system-policy.js";
import { createAllowedFileTree } from "../inspection/context-policy.js";
import { validateProposal } from "./validate-proposal.js";

export function validateStaffingProposal(
  input: unknown,
  configuration: z.input<typeof staffingSystemPolicySchema>
): void {
  const proposal = staffingProposalSchema.parse(input);
  const config = staffingSystemPolicySchema.parse(configuration);
  const contextAccessPolicy = resolveContextAccessPolicy(config);
  if (
    new Set(config.availableSpecialists.map(({ id }) => id)).size !==
    config.availableSpecialists.length
  )
    throw new Error("Invalid Harness staffing configuration.");
  if (
    new Set(proposal.assignments.map(({ assignmentId }) => assignmentId))
      .size !== proposal.assignments.length
  )
    throw new Error("Duplicate Assignment IDs.");
  assertRepositoryMatchesSnapshot(proposal.snapshot);
  const files = listRepositoryFilesAtCommit(
    proposal.snapshot.repositoryRoot,
    proposal.snapshot.commitSha
  );
  const fileTree = createAllowedFileTree(
    files,
    contextAccessPolicy,
    config.limits
  );
  validateProposal(
    proposal,
    {
      goal: proposal.goal,
      snapshot: proposal.snapshot,
      files,
      fileTree,
    },
    config
  );
  assertRepositoryMatchesSnapshot(proposal.snapshot);
}
