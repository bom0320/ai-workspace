import { z } from "zod";
import {
  staffingSystemPolicySchema,
  type StaffingSystemPolicy,
} from "@/contracts/staffing-system-policy.js";
export {
  staffingSystemPolicySchema,
  type StaffingSystemPolicy,
} from "@/contracts/staffing-system-policy.js";

// Historical data only: no legacy rule is interpreted or discarded. Old policy
// versions remain signed history and require explicit Human reapproval.
export const recordedSystemPolicySchema = z.union([
  staffingSystemPolicySchema,
  staffingSystemPolicySchema
    .omit({ maxAgentInvocations: true })
    .extend({
      policy: z
        .object({
          maxAgentInvocations: z.number().int().positive(),
          enforcementRules: z.array(z.unknown()),
        })
        .strict(),
    })
    .strict(),
]);

export function requireCurrentSystemPolicy(
  configuration: z.infer<typeof recordedSystemPolicySchema>
): StaffingSystemPolicy {
  if ("policy" in configuration)
    throw new Error("Legacy System Policy requires explicit Human reapproval.");
  return configuration;
}
