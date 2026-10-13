import { createInterface } from "node:readline";

async function readAnswer(): Promise<string> {
  if (process.stdin.readableEnded || process.stdin.destroyed) return "";
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for await (const answer of reader) return answer;
    return "";
  } finally {
    reader.close();
  }
}

export async function approveCommit(): Promise<boolean> {
  console.log("Commit applied changes?\nCommit / Skip:");
  return (await readAnswer()).trim().toLowerCase() === "commit";
}

export async function askCommitMessage(): Promise<string> {
  console.log("Commit message:");
  return readAnswer();
}

export async function approvePush(): Promise<boolean> {
  console.log("Push commit to remote?\nPush / Skip:");
  return (await readAnswer()).trim().toLowerCase() === "push";
}
