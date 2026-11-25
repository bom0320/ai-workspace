import { z } from "zod";

export const specialistDefinitionSchema = z
  .object({
    id: z.string().min(1),
    role: z.string().min(1),
    objective: z.string().min(1),
  })
  .strict();

export type SpecialistDefinition = z.infer<typeof specialistDefinitionSchema>;

export function hasUniqueSpecialistIds(
  items: readonly Pick<SpecialistDefinition, "id">[]
) {
  return new Set(items.map(({ id }) => id)).size === items.length;
}

export const specialistDefinitionsSchema = z
  .array(specialistDefinitionSchema)
  .refine(hasUniqueSpecialistIds, "Duplicate Specialist IDs.");
