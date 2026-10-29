import { z } from "zod";

import { repositorySnapshotSchema } from "@/contracts/repository-snapshot.js";
import { specialistDefinitionSchema } from "@/contracts/specialist.js";
import { goalSpecSchema } from "@/contracts/goal.js";
import { inspectedFileSchema } from "@/contracts/inspected-file.js";

const nonEmptyString = z.string().min(1);

const approvedAssignmentSchema = z
  .object({
    assignmentId: nonEmptyString,
    specialistId: nonEmptyString,
    objective: nonEmptyString,
    contextPaths: z.array(nonEmptyString).min(1),
  })
  .strict();

// Issued scopes are immutable records by domain convention: issue a new version
// for changed authority. Parsing neither enforces lifecycle nor proves approval.
export const approvedOperatingScopeSchema = z
  .object({
    id: nonEmptyString,
    version: z.number().int().positive(),
    proposalId: nonEmptyString,
    approvalRecordId: nonEmptyString,
    policyVersion: nonEmptyString,
    goal: goalSpecSchema.strict(),
    snapshot: repositorySnapshotSchema,
    assignments: z.array(approvedAssignmentSchema).min(1),
    budget: z
      .object({ maxAgentInvocations: z.number().int().positive() })
      .strict(),
  })
  .strict();

// CEO-owned request data; authority and objective must come from trusted sources.
// Context subset checks are performed by Harness authority evaluation.
export const invokeSpecialistRequestSchema = z
  .object({
    scopeId: nonEmptyString,
    scopeVersion: z.number().int().positive(),
    assignmentId: nonEmptyString,
    requestedContextPaths: z.array(nonEmptyString).min(1),
  })
  .strict();

// Harness-owned execution data, not an authorization token obtainable by parsing.
// File contents must later be loaded from the approved snapshot by enforcement.
export const authorizedSpecialistInvocationSchema = z
  .object({
    invocationId: nonEmptyString,
    goal: goalSpecSchema.strict(),
    snapshot: repositorySnapshotSchema,
    specialist: specialistDefinitionSchema,
    files: z.array(inspectedFileSchema.strict()).min(1),
  })
  .strict();

export const authorityVerdictSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("allowed"),
      invocation: authorizedSpecialistInvocationSchema,
    })
    .strict(),
  z
    .object({ status: z.literal("approval-required"), reason: nonEmptyString })
    .strict(),
  z.object({ status: z.literal("denied"), reason: nonEmptyString }).strict(),
]);

export type ApprovedAssignment = z.infer<typeof approvedAssignmentSchema>;
export type ApprovedOperatingScope = z.infer<
  typeof approvedOperatingScopeSchema
>;
export type InvokeSpecialistRequest = z.infer<
  typeof invokeSpecialistRequestSchema
>;
export type AuthorizedSpecialistInvocation = z.infer<
  typeof authorizedSpecialistInvocationSchema
>;
export type AuthorityVerdict = z.infer<typeof authorityVerdictSchema>;

// Caller-supplied Harness facts, not CEO request data. Parsing cannot prove trust
// or freshness; usage is scope-version usage, not per-assignment usage.
export const invocationEvaluationContextSchema = z
  .object({
    scopeStatus: z.enum(["active", "revoked", "superseded"]),
    usedAgentInvocations: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

// Eligibility never grants execution authority or reserves invocation budget.
export const invocationEligibilitySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("eligible") }).strict(),
  z
    .object({
      status: z.literal("reapproval-required"),
      reason: nonEmptyString,
    })
    .strict(),
  z.object({ status: z.literal("denied"), reason: nonEmptyString }).strict(),
]);

export type InvocationEvaluationContext = z.infer<
  typeof invocationEvaluationContextSchema
>;
export type InvocationEligibility = z.infer<typeof invocationEligibilitySchema>;
