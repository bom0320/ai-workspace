import { createInterface } from "node:readline";

export type WorkflowSelection = "plan" | "decision";

export async function selectWorkflow(): Promise<WorkflowSelection> {
  console.log(
    "AI Workspace\n\nSelect workflow:\n\n1. Plan only\n2. Decision\n"
  );
  const reader = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const lines = reader[Symbol.asyncIterator]();
  try {
    while (true) {
      console.log("> ");
      const line = await lines.next();
      if (line.done)
        throw new Error(
          "Workflow input ended before a valid selection was provided."
        );
      switch (line.value.trim()) {
        case "1":
          return "plan";
        case "2":
          return "decision";
        default:
          console.error("Please enter 1 or 2.");
      }
    }
  } finally {
    reader.close();
  }
}
