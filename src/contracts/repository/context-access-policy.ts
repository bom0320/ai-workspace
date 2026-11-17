import { z } from "zod";

// Structural contract only; repository path safety is checked by access validation.
export const pathScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("file"), path: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("directory"), path: z.string().min(1) }).strict(),
]);
export const contextAccessPolicySchema = z
  .object({
    allowedScopes: z.array(pathScopeSchema),
  })
  .strict();
export type PathScope = z.infer<typeof pathScopeSchema>;
export type ContextAccessPolicy = z.infer<typeof contextAccessPolicySchema>;
