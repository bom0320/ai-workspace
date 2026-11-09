import { randomUUID } from "node:crypto";

// Process-local Harness identity. Copies and serialized handles are untrusted.
export type InvocationAttempt = Readonly<{ invocationId: string }>;
const attempts = new WeakSet<InvocationAttempt>();

export function createInvocationAttempt(): InvocationAttempt {
  const attempt = Object.freeze({ invocationId: `invocation-${randomUUID()}` });
  attempts.add(attempt);
  return attempt;
}

export function assertTrustedInvocationAttempt(
  attempt: InvocationAttempt
): void {
  if (!attempts.has(attempt)) throw new Error("Untrusted Invocation attempt.");
}
