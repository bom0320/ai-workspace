import { z } from "zod";
import { specialistDefinitionSchema } from "@/contracts/specialist.js";
import { listRepositoryFilesAtCommit } from "@/infrastructure/git/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import { isUnambiguousRepositoryPath } from "@/services/repository-inspection/index.js";
import { staffingProposalSchema } from "../../model/staffing.js";
import { staffingProposalPolicySchema } from "../../model/policy.js";
import { staffingInspectionLimitsSchema } from "../../protocol/context.js";
import { createAllowedFileTree } from "../inspection/context-policy.js";
import { validateProposal } from "./validate-proposal.js";

const configurationSchema = z
  .object({
    availableSpecialists: z.array(specialistDefinitionSchema),
    allowedContextPaths: z.array(z.string().min(1)),
    limits: staffingInspectionLimitsSchema,
    policy: staffingProposalPolicySchema,
  })
  .strict();
export function validateStaffingProposal(
  input: unknown,
  configuration: z.infer<typeof configurationSchema>
): void {
  const proposal = staffingProposalSchema.parse(input);
  const config = configurationSchema.parse(configuration);
  if (
    new Set(config.availableSpecialists.map(({ id }) => id)).size !==
      config.availableSpecialists.length ||
    config.allowedContextPaths.some(
      (path) => !isUnambiguousRepositoryPath(path)
    )
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
    new Set(config.allowedContextPaths),
    config.limits
  );
  validateProposal(
    proposal,
    {
      snapshot: proposal.snapshot,
      files,
      allowedContextPaths: config.allowedContextPaths,
      context: {
        goal: proposal.goal,
        repository: {
          name: proposal.goal.targetRepository,
          commitSha: proposal.snapshot.commitSha,
          fileTree,
          packageScripts: {},
        },
        inspectedFiles: [],
        availableSpecialists: config.availableSpecialists.map(
          ({ id, role, objective }) => ({ id, role, objective })
        ),
        limits: config.limits,
        remainingInspectionBudget: config.limits.maxTotalFiles,
      },
    },
    config.availableSpecialists,
    config.policy
  );
  assertRepositoryMatchesSnapshot(proposal.snapshot);
}
