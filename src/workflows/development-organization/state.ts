import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { goalSpecSchema } from "@/contracts/goal.js";

// Only organization-wide inputs belong here; phase results stay in their phase.
export const developmentOrganizationState = new StateSchema({
  goal: goalSpecSchema,
  repositoryPath: z.string().min(1),
});

export type DevelopmentOrganizationState =
  typeof developmentOrganizationState.State;
