import { createInterface } from "node:readline";

export type DecisionInput = {
  repositoryPath: string;
  objective: string;
  filePaths: string[];
};

export async function askDecision(): Promise<DecisionInput> {
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  const lines = reader[Symbol.asyncIterator]();
  async function readLine(): Promise<string> {
    const line = await lines.next();
    if (line.done) throw new Error("Decision input ended before all required values were provided.");
    return line.value.trim();
  }
  async function readRequired(label: string): Promise<string> {
    while (true) {
      console.log(`${label}:\n> `);
      const value = await readLine();
      if (value) return value;
      console.error(`${label} must not be empty.`);
    }
  }
  try {
    const repositoryPath = await readRequired("Repository");
    const objective = await readRequired("Decision Goal");
    console.log("Context Files\nEnter one repository-relative file path per line.\nSubmit an empty line when finished.\n");
    const filePaths: string[] = [];
    while (true) {
      console.log("> ");
      const path = await readLine();
      if (path) filePaths.push(path);
      else if (filePaths.length > 0) return { repositoryPath, objective, filePaths };
      else console.error("At least one context file is required.");
    }
  } finally {
    reader.close();
  }
}
