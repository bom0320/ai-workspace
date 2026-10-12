import type { TaskContract } from "@/contracts/task.js";

export function presentTaskContract(task: TaskContract): void {
  console.log("\nTask Contract:");
  console.log(JSON.stringify(task, null, 2));
}
