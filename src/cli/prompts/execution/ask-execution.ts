import { createInterface } from "node:readline";

export type ExecutionInput = {
  taskPath: string;
  repositoryPath: string;
};

export async function askExecution(): Promise<ExecutionInput> {
  const reader = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const lines = reader[Symbol.asyncIterator]();
  async function readRequired(label: string): Promise<string> {
    while (true) {
      console.log(`${label}:\n> `);
      const line = await lines.next();
      if (line.done)
        throw new Error(
          "Execution input ended before all required values were provided."
        );
      const value = line.value.trim();
      if (value) return value;
      console.error(`${label} must not be empty.`);
    }
  }
  try {
    const taskPath = await readRequired("Task path");
    const repositoryPath = await readRequired("Repository");
    return { taskPath, repositoryPath };
  } finally {
    reader.close();
  }
}
