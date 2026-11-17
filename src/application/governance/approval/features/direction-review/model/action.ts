import { z } from "zod";

const text = z.string().trim().min(1);
export const directionActionSchema = z.discriminatedUnion("action", [
  z
    .object({ reviewId: text, binding: text, action: z.literal("approve") })
    .strict(),
  z
    .object({ reviewId: text, binding: text, action: z.literal("reject") })
    .strict(),
  z
    .object({
      reviewId: text,
      binding: text,
      action: z.literal("request-revision"),
      feedback: text,
    })
    .strict(),
]);
export type DirectionAction = z.infer<typeof directionActionSchema>;
