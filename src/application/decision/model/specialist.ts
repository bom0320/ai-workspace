import type { SpecialistAuthority } from "./authority.js";

export type SpecialistDefinition = {
  id: string;
  role: string;
  objective: string;
  authority: SpecialistAuthority;
};
