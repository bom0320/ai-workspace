import { z } from "zod";

import { taskContractSchema } from "@/contracts/task.js";

export const taskContractDraftSchema = taskContractSchema.omit({
  id: true,
  goalId: true,
});

export type TaskContractDraft = z.infer<typeof taskContractDraftSchema>;
