import { createInterface } from "node:readline";

export async function approveTask(): Promise<boolean> {
  console.log("Execute this task?");
  console.log("Approve / Reject (enter Approve to execute):");
  const reader = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    for await (const answer of reader) {
      return answer.trim().toLowerCase() === "approve";
    }
    return false;
  } finally {
    reader.close();
  }
}
