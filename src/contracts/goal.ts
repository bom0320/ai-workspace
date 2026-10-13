import { z } from "zod";

const nonEmptyString = z.string().min(1);

// GoalSpec schema is the runtime source of truth.
export const goalSpecSchema = z.object({
  // Outcome the goal must achieve.
  objective: nonEmptyString,

  // Repository targeted by the goal.
  targetRepository: nonEmptyString,

  // Behavioral and implementation limits for the goal.
  constraints: z.array(nonEmptyString).optional(),
});

export type GoalSpec = z.infer<typeof goalSpecSchema>;
