import { createInterface } from "node:readline";

export type WorkflowSelection =
  "plan-execute" | "plan" | "decision" | "execute";

export async function selectWorkflow(): Promise<WorkflowSelection> {
  console.log(
    "AI Workspace\n\nSelect workflow:\n\n1. Plan & Execute\n2. Plan only\n3. Decision\n4. Execute existing task\n"
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
          return "plan-execute";
        case "2":
          return "plan";
        case "3":
          return "decision";
        case "4":
          return "execute";
        default:
          console.error("Please enter 1, 2, 3, or 4.");
      }
    }
  } finally {
    reader.close();
  }
}
