import { z } from "zod";
const text = z.string().min(1);
const date = z.iso.datetime();

export const humanConfirmationEvidenceSchema = z
  .object({ id: text, uid: z.number().int().nonnegative(), confirmedAt: date })
  .strict();
