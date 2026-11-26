import type {
  CollaborativeSpecialistContext,
  SpecialistContext,
} from "../protocol/context.js";
import type { SpecialistDefinition } from "@/contracts/specialist/definition.js";
import type { SpecialistAuthority } from "@/contracts/specialist/authority.js";
import type { InspectedFile } from "@/contracts/repository/inspected-file.js";
export type IndependentDecisionInput = {
  specialist: SpecialistDefinition;
  authority: SpecialistAuthority;
  assignmentObjective?: string;
  files: InspectedFile[];
};
export type CodexSpecialistOptions = {
  timeoutMs?: number;
};

export type IndependentDecisionOptions = CodexSpecialistOptions & {
  classifyValidationErrors?: boolean;
};

export type SpecialistReadInput = {
  specialist: SpecialistDefinition;
  context: SpecialistContext;
  authority: SpecialistAuthority;
};

export type CollaborativeSpecialistReadInput = {
  specialist: SpecialistReadInput["specialist"];
  context: CollaborativeSpecialistContext;
  authority: SpecialistReadInput["authority"] | undefined;
};

export type SpecialistAnalysisInput =
  | ({ mode: "independent" } & SpecialistReadInput)
  | ({ mode: "assignment" } & CollaborativeSpecialistReadInput);
