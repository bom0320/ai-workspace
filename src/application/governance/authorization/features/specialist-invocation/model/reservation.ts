import { z } from "zod";

const text = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

// Reserved is consumed budget, regardless of later execution success. A digest
// binds the exact issued input for Step 5; parsing alone proves no reservation.
export const invocationReservationSchema = z
  .object({
    invocationId: text,
    scopeId: text,
    scopeVersion: z.number().int().positive(),
    assignmentId: text,
    requestDigest: digest,
    invocationDigest: digest,
    reservedAt: z.iso.datetime(),
    claimedAt: z.iso.datetime().optional(),
  })
  .strict()
  .refine(
    ({ reservedAt, claimedAt }) =>
      claimedAt === undefined ||
      Date.parse(claimedAt) >= Date.parse(reservedAt),
    { message: "Claim cannot precede reservation." }
  );
export type InvocationReservation = z.infer<typeof invocationReservationSchema>;
