import { createInterface } from "node:readline";

import type { TaskContract } from "@/contracts/task.js";

export async function approveTask(task: TaskContract): Promise<boolean> {
  console.log("\nTask Contract:");
  console.log(JSON.stringify(task, null, 2));
  console.log("Approve / Reject (enter Approve to execute):");
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for await (const answer of reader) {
      return answer.trim().toLowerCase() === "approve";
    }
    return false;
  } finally {
    reader.close();
  }
}
