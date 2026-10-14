import { createInterface } from "node:readline";

export type GoalInput = {
  repositoryPath: string;
  objective: string;
};

export async function askGoal(): Promise<GoalInput> {
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  const lines = reader[Symbol.asyncIterator]();
  async function readRequired(label: string): Promise<string> {
    while (true) {
      console.log(`${label}:\n> `);
      const line = await lines.next();
      if (line.done) throw new Error("Goal input ended before all required values were provided.");
      const value = line.value.trim();
      if (value) return value;
      console.error(`${label} must not be empty.`);
    }
  }
  try {
    const repositoryPath = await readRequired("Repository");
    const objective = await readRequired("Goal");
    return { repositoryPath, objective };
  } finally {
    reader.close();
  }
}
