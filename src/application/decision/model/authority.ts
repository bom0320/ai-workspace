import { z } from "zod";

export const specialistAuthoritySchema = z.object({
  repositoryAccess: z.enum(["none", "read", "write"]),
  shellExecution: z.boolean(),
}).strict();

export type SpecialistAuthority = z.infer<typeof specialistAuthoritySchema>;
export type RepositoryAccess = SpecialistAuthority["repositoryAccess"];
