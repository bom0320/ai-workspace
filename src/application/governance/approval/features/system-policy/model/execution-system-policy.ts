import { z } from "zod";
import {
  isInternalInspectionComponent,
  isUnambiguousRepositoryPath,
} from "@/services/repository-inspection/index.js";
import { humanConfirmationEvidenceSchema } from "../../../shared/model/confirmation.js";

const text = z.string().min(1);
const positive = z.number().int().positive();
const exactPath = text.refine(
  (path) =>
    path === path.trim() &&
    isUnambiguousRepositoryPath(path) &&
    !/[*?\[\]{}]/.test(path) &&
    path
      .split("/")
      .every((part) => !isInternalInspectionComponent(part.toLowerCase())),
  "Expected an exact Repository-relative file path."
);

function unique<T>(values: T[]) {
  return new Set(values).size === values.length;
}

export const executionBoundsSchema = z
  .object({
    readPaths: z.array(exactPath).refine(unique),
    writePaths: z.array(exactPath).refine(unique),
    // Command IDs represent exact argv, with no interpreter or user-supplied args.
    shellCommands: z.array(z.literal("git diff --check")).refine(unique),
    budget: z
      .object({ maxExecutions: positive, maxTimeoutMs: positive })
      .strict(),
  })
  .strict();

export const executionSystemPolicySchema = executionBoundsSchema.extend({
  maxDelegationDurationMs: positive,
});
export type ExecutionSystemPolicy = z.infer<typeof executionSystemPolicySchema>;

export const recordedExecutionPolicySchema = z
  .object({
    version: positive,
    repositoryRoot: text,
    policy: executionSystemPolicySchema.nullable(),
    binding: text,
    approval: humanConfirmationEvidenceSchema,
    configuredAt: z.iso.datetime(),
  })
  .strict();
