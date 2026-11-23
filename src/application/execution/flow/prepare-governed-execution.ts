import { checkExecutionEligibility } from "@/application/governance/index.js";

export function prepareGovernedExecution(input: unknown) {
  const verdict = checkExecutionEligibility(input);
  if (verdict.status !== "eligible") return verdict;

  // The stock Worker runtime cannot enforce the file and command grants.
  // Leave the execution budget untouched until a conforming runtime is available.
  return {
    status: "blocked" as const,
    reason: "Worker runtime cannot enforce approved file and command limits.",
  };
}
