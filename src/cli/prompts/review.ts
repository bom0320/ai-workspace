import { createInterface } from "node:readline";

export async function completeReview(): Promise<boolean> {
  console.log("Review complete?\nContinue / Abort:");
  if (process.stdin.readableEnded || process.stdin.destroyed) return false;
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for await (const answer of reader) return answer.trim().toLowerCase() === "continue";
    return false;
  } finally { reader.close(); }
}
