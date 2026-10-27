import type { TaskContract } from "@/contracts/task.js";

export function presentTaskContract(task: TaskContract): void {
  console.log("\nTask Contract:");
  console.log(`Task ID: ${task.id}`);
  console.log(`Goal ID: ${task.goalId}`);
  console.log(`Target Repository: ${task.targetRepository}`);
  console.log(`\nObjective:\n${task.objective}`);

  const sections: [string, string[]][] = [
    ["Allowed Paths", task.allowedPaths],
    ["Forbidden Paths", task.forbiddenPaths],
    ["Constraints", task.constraints],
    ["Acceptance Criteria", task.acceptanceCriteria],
    ["Verification Commands", task.verification],
  ];
  for (const [label, items] of sections) {
    console.log(`\n${label}:`);
    if (items.length === 0) console.log("  None");
    for (const item of items) console.log(`  - ${item}`);
  }
}
