import { z } from "zod";

const nonEmptyString = z.string().min(1);

export const taskContractSchema = z.object({
  id: nonEmptyString,
  goalId: nonEmptyString,
  objective: nonEmptyString,
  targetRepository: nonEmptyString,
  allowedPaths: z.array(nonEmptyString),
  forbiddenPaths: z.array(nonEmptyString),
  constraints: z.array(nonEmptyString),
  acceptanceCriteria: z.array(nonEmptyString),
  verification: z.array(nonEmptyString),
});

export type TaskContract = z.infer<typeof taskContractSchema>;
