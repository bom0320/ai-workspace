import { z } from "zod";
import { executionDelegationRequestSchema } from "../../approval/features/execution-delegation/model/execution-delegation.js";

export const executionDelegationApprovalInputSchema = z
  .object({
    approvedDecisionId: z.string().min(1),
    repositoryPath: z.string().min(1),
    grant: executionDelegationRequestSchema,
  })
  .strict();
