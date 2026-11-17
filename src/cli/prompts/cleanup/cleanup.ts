import { createInterface } from "node:readline";

export async function approveWorkspaceDeletion(): Promise<boolean> {
  console.log("Cleanup execution workspace?\nDelete / Keep:");
  if (process.stdin.readableEnded || process.stdin.destroyed) return false;
  const reader = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    for await (const answer of reader)
      return answer.trim().toLowerCase() === "delete";
    return false;
  } finally {
    reader.close();
  }
}
