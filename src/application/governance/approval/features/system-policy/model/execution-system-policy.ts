import { z } from "zod";
import {
  pathScopeSchema,
  type PathScope,
} from "@/contracts/repository/context-access-policy.js";
import {
  isContextScopeContained,
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

export const codexWorktreeModeNotice =
  "Codex can inspect and edit the Worktree and run development commands in workspace-write. The sandbox restricts writes and network access, but may expose host files to reading. The Harness checks final changed paths and runs separately approved verification. Scope checks cannot undo side effects.";

export const codexWorktreeModeSchema = z.literal("codex-worktree");

export const executionBoundsSchema = z
  .object({
    readPaths: z.array(exactPath).refine(unique),
    writePaths: z.array(exactPath).refine(unique),
    workerMode: codexWorktreeModeSchema.optional(),
    // Harness Verification IDs represent fixed argv. Worker tools use workerMode.
    shellCommands: z.array(z.literal("git diff --check")).refine(unique),
    budget: z
      .object({ maxExecutions: positive, maxTimeoutMs: positive })
      .strict(),
  })
  .strict();

const scopeList = z
  .array(
    pathScopeSchema.refine(({ path }) => exactPath.safeParse(path).success)
  )
  .refine((scopes) =>
    unique(scopes.map(({ kind, path }) => `${kind}:${path}`))
  );

export const scopedExecutionBoundsSchema = executionBoundsSchema
  .omit({
    readPaths: true,
    writePaths: true,
  })
  .extend({ readScopes: scopeList, writeScopes: scopeList });

const duration = {
  maxDelegationDurationMs: positive,
};
export const executionSystemPolicySchema = z.union([
  executionBoundsSchema.extend(duration),
  scopedExecutionBoundsSchema.extend(duration),
]);
export type ExecutionSystemPolicy = z.infer<typeof executionSystemPolicySchema>;

export function executionScopes(
  bounds:
    | z.infer<typeof executionBoundsSchema>
    | z.infer<typeof scopedExecutionBoundsSchema>
): { readScopes: PathScope[]; writeScopes: PathScope[] } {
  if ("readScopes" in bounds) return bounds;
  return {
    readScopes: bounds.readPaths.map((path) => ({ kind: "file", path })),
    writeScopes: bounds.writePaths.map((path) => ({ kind: "file", path })),
  };
}

export function isExecutionScopeContained(
  requested: ReturnType<typeof executionScopes>,
  allowed: ReturnType<typeof executionScopes>
): boolean {
  return (
    requested.readScopes.every((scope) =>
      isContextScopeContained(scope, { allowedScopes: allowed.readScopes })
    ) &&
    requested.writeScopes.every((scope) =>
      isContextScopeContained(scope, { allowedScopes: allowed.writeScopes })
    )
  );
}

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
