import { readFileSync } from "node:fs";

import {
  taskContractSchema,
  type TaskContract,
} from "./contracts/task.js";

export function loadTaskContract(path: string): TaskContract {
  const contents = readFileSync(path, "utf8");
  const input: unknown = JSON.parse(contents);

  return taskContractSchema.parse(input);
}
