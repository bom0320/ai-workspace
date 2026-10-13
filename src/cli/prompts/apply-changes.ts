import { createInterface } from "node:readline";

export async function approveApply(): Promise<boolean> {
  console.log("Apply verified changes to the original repository?");
  console.log("Apply / Skip (enter Apply to apply):");
  if (process.stdin.readableEnded || process.stdin.destroyed) return false;
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for await (const answer of reader) {
      return answer.trim().toLowerCase() === "apply";
    }
    return false;
  } finally {
    reader.close();
  }
}
