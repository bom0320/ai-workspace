import { contextAccessPolicySchema } from "@/contracts/context-access-policy.js";
import { resolveContextAccessPolicy } from "@/services/repository-inspection/index.js";
import { z } from "zod";
import { specialistDefinitionSchema } from "@/contracts/specialist.js";
import { listRepositoryFilesAtCommit } from "@/infrastructure/git/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import { staffingProposalSchema } from "../../model/staffing.js";
import { staffingProposalPolicySchema } from "../../model/policy.js";
import { staffingInspectionLimitsSchema } from "../../protocol/context.js";
import { createAllowedFileTree } from "../inspection/context-policy.js";
import { validateProposal } from "./validate-proposal.js";

const configurationSchema = z
  .object({
    availableSpecialists: z.array(specialistDefinitionSchema),
    allowedContextPaths: z.array(z.string().min(1)).default([]),
    contextAccessPolicy: contextAccessPolicySchema.optional(),
    limits: staffingInspectionLimitsSchema,
    policy: staffingProposalPolicySchema,
  })
  .strict();
export function validateStaffingProposal(
  input: unknown,
  configuration: z.input<typeof configurationSchema>
): void {
  const proposal = staffingProposalSchema.parse(input);
  const config = configurationSchema.parse(configuration);
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
      contextAccessPolicy,
      specialists: config.availableSpecialists,
      limits: config.limits,
    },
    config.policy
  );
  assertRepositoryMatchesSnapshot(proposal.snapshot);
}
