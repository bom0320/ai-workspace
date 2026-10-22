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
