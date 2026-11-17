import { z } from "zod";

export const inspectedFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export type InspectedFile = z.infer<typeof inspectedFileSchema>;
