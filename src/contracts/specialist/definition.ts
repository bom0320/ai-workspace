import { z } from "zod";

import { specialistAuthoritySchema } from "./authority.js";

export const specialistDefinitionSchema = z
  .object({
    id: z.string().min(1),
    role: z.string().min(1),
    objective: z.string().min(1),
    authority: specialistAuthoritySchema,
  })
  .strict();

export type SpecialistDefinition = z.infer<typeof specialistDefinitionSchema>;

// Shared registration-list invariant, independent of System Policy authority or
// a minimum candidate count. Discovery also accepts this list on its own.
export const specialistDefinitionsSchema = z
  .array(specialistDefinitionSchema)
  .refine(
    (items) => new Set(items.map(({ id }) => id)).size === items.length,
    "Duplicate Specialist IDs."
  );
