import { z } from "zod";

import { goalSpecSchema } from "@/contracts/goal.js";
import { repositorySnapshotSchema } from "@/contracts/repository/snapshot.js";
import { inspectedFileSchema } from "@/contracts/repository/inspected-file.js";
import { specialistDefinitionSchema } from "@/contracts/specialist/definition.js";

const nonEmptyString = z.string().min(1);
const positiveInteger = z.number().int().positive();

// 1. Approved Scope
// Defines the operating boundary issued after Staffing Approval.
// Schema validation alone does not prove approval or current validity.

const approvedAssignmentSchema = z
  .object({
    assignmentId: nonEmptyString,
    specialistId: nonEmptyString,
    objective: nonEmptyString,
    contextPaths: z.array(nonEmptyString).min(1),
  })
  .strict();

export const approvedOperatingScopeSchema = z
  .object({
    id: nonEmptyString,
    version: positiveInteger,
    proposalId: nonEmptyString,
    approvalRecordId: nonEmptyString,
    policyVersion: nonEmptyString,
    goal: goalSpecSchema.strict(),
    snapshot: repositorySnapshotSchema,
    assignments: z.array(approvedAssignmentSchema).min(1),
    budget: z
      .object({
        maxAgentInvocations: positiveInteger,
      })
      .strict(),
  })
  .strict();

// 2. Invocation Request
// CEO selects an approved Assignment and Context subset.
// Specialist identity, objective, and authority cannot be overridden.

export const invokeSpecialistRequestSchema = z
  .object({
    scopeId: nonEmptyString,
    scopeVersion: positiveInteger,
    assignmentId: nonEmptyString,
    requestedContextPaths: z.array(nonEmptyString).min(1),
  })
  .strict();

// 3. Invocation Eligibility
// Evaluates a request against the approved Scope and Harness facts.
// Eligibility does not grant authority or reserve execution budget.

export const invocationEvaluationContextSchema = z
  .object({
    scopeStatus: z.enum(["active", "revoked", "superseded"]),
    // Total reservations for the Scope version, across all Assignments.
    usedAgentInvocations: z.number().int().nonnegative().safe(),
  })
  .strict();

export const invocationEligibilitySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("eligible") }).strict(),
  z
    .object({
      status: z.literal("reapproval-required"),
      reason: nonEmptyString,
    })
    .strict(),
  z
    .object({
      status: z.literal("denied"),
      reason: nonEmptyString,
    })
    .strict(),
]);

// 4. Authorized Invocation
// Harness assembles execution input from the validated Scope,
// current System Policy, and approved Repository Snapshot.
// Step 5 must verify the persisted Reservation before execution.

export const authorizedSpecialistInvocationSchema = z
  .object({
    invocationId: nonEmptyString,
    scopeId: nonEmptyString,
    scopeVersion: positiveInteger,
    assignmentId: nonEmptyString,
    assignmentObjective: nonEmptyString,
    goal: goalSpecSchema.strict(),
    snapshot: repositorySnapshotSchema,
    specialist: specialistDefinitionSchema,
    files: z.array(inspectedFileSchema.strict()).min(1),
  })
  .strict();

// 5. Authorization Verdict
// Represents the Harness authorization result.
// Only an allowed verdict contains an Authorized Invocation.

export const authorityVerdictSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("allowed"),
      invocation: authorizedSpecialistInvocationSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("approval-required"),
      reason: nonEmptyString,
    })
    .strict(),
  z
    .object({
      status: z.literal("denied"),
      reason: nonEmptyString,
    })
    .strict(),
]);

// Inferred Types

export type ApprovedAssignment = z.infer<typeof approvedAssignmentSchema>;
export type ApprovedOperatingScope = z.infer<
  typeof approvedOperatingScopeSchema
>;

export type InvokeSpecialistRequest = z.infer<
  typeof invokeSpecialistRequestSchema
>;

export type InvocationEvaluationContext = z.infer<
  typeof invocationEvaluationContextSchema
>;
export type InvocationEligibility = z.infer<typeof invocationEligibilitySchema>;

export type AuthorizedSpecialistInvocation = z.infer<
  typeof authorizedSpecialistInvocationSchema
>;
export type AuthorityVerdict = z.infer<typeof authorityVerdictSchema>;
