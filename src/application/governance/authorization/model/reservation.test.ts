import { describe, expect, it } from "vitest";
import { invocationReservationSchema } from "./reservation.js";
const record = {
  invocationId: "invocation-1",
  scopeId: "scope-1",
  scopeVersion: 1,
  assignmentId: "assignment-1",
  requestDigest: "a".repeat(64),
  invocationDigest: "b".repeat(64),
  reservedAt: "2026-11-09T00:00:00.000Z",
};
describe("Invocation reservation structure", () => {
  it("preserves bindings without implying execution", () => {
    expect(invocationReservationSchema.parse(record)).toEqual(record);
  });
  it.each([
    { ...record, scopeVersion: 0 },
    { ...record, scopeVersion: 1.5 },
    { ...record, invocationId: "" },
    { ...record, requestDigest: "bad" },
    { ...record, invocationDigest: "bad" },
    { ...record, reservedAt: "bad" },
    { ...record, authority: "write" },
  ])("rejects malformed reservation %#", (input) => {
    expect(invocationReservationSchema.safeParse(input).success).toBe(false);
  });
});
