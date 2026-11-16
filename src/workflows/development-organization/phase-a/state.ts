import { StateSchema } from "@langchain/langgraph";
import { staffingSetupOutput } from "./staffing-setup/state.js";

// Phase A shares inputs and the Setup outcome, not its internal policy/Proposal channels.
export const phaseAState = new StateSchema({ ...staffingSetupOutput.fields });
export type PhaseAState = typeof phaseAState.State;
