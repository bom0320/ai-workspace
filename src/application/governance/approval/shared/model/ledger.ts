import { z } from "zod";
import { staffingProposalSchema } from "@/application/staffing/index.js";
import { approvedOperatingScopeSchema } from "../../../model/authority.js";
import { recordedSystemPolicySchema } from "../../features/system-policy/model/policy.js";
import { humanDelegationPolicySchema } from "../../features/human-delegation/model/policy.js";
import { approvalRecordSchema } from "../../features/proposal-management/model/approval.js";
import { humanConfirmationEvidenceSchema as confirmation } from "./confirmation.js";
const text = z.string().min(1);

export const governanceLedgerSchema = z
  .object({
    repositories: z.record(
      text,
      z
        .object({
          systems: z.array(
            z
              .object({
                version: z.number().int().positive(),
                configuration: recordedSystemPolicySchema,
                approval: confirmation,
              })
              .strict()
          ),
          delegations: z.array(humanDelegationPolicySchema),
          issuances: z.array(
            z
              .object({
                proposal: staffingProposalSchema,
                approval: approvalRecordSchema,
                scope: approvedOperatingScopeSchema,
              })
              .strict()
          ),
        })
        .strict()
    ),
  })
  .strict();
export type GovernanceLedger = z.infer<typeof governanceLedgerSchema>;
export type RepositoryGovernance = GovernanceLedger["repositories"][string];
