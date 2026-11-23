import type { TaskContract } from "@/contracts/task.js";
import {
  executionBoundsSchema,
  executionScopes,
  isExecutionScopeContained,
} from "../../../../approval/features/system-policy/model/execution-system-policy.js";

type TaskExecutionFields = Pick<
  TaskContract,
  "allowedPaths" | "forbiddenPaths" | "verification"
>;

// Validates contract compatibility only. Authority and file freshness are
// established separately by the Ledger-backed authorization flow.
export function validateTaskExecutionContract(
  task: TaskExecutionFields,
  bounds: Parameters<typeof executionScopes>[0]
) {
  const writePaths = executionBoundsSchema.shape.writePaths.parse(
    task.allowedPaths
  );
  const forbiddenPaths = executionBoundsSchema.shape.writePaths.parse(
    task.forbiddenPaths
  );
  const shellCommands = executionBoundsSchema.shape.shellCommands.parse(
    task.verification
  );
  if (
    !writePaths.length ||
    writePaths.some((path) => forbiddenPaths.includes(path)) ||
    !isExecutionScopeContained(
      {
        readScopes: [],
        writeScopes: writePaths.map((path) => ({ kind: "file", path })),
      },
      executionScopes(bounds)
    ) ||
    !shellCommands.every((command) => bounds.shellCommands.includes(command))
  )
    throw new Error(
      "Task write scope or verification exceeds execution bounds."
    );

  return { writePaths, shellCommands };
}
