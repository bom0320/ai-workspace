import type {
  AgentDecision,
  RepositorySnapshot,
} from "@/application/decision/index.js";

export function presentDecisions(
  snapshot: RepositorySnapshot,
  decisions: AgentDecision[]
): void {
  console.log(`Snapshot: ${snapshot.commitSha}`);
  console.log(`Specialists: ${decisions.length}`);
  for (const decision of decisions) {
    const label =
      decision.specialistId === "frontend"
        ? "Frontend Specialist"
        : decision.specialistId === "ux"
          ? "UX Specialist"
          : decision.specialistId;
    console.log(`\n[${label}]`);
    console.log(`Recommendation:\n${decision.recommendation}`);
    console.log("Evidence:");
    if (decision.evidence.length === 0) console.log("- (none)");
    for (const evidence of decision.evidence) {
      const lines =
        evidence.lineStart === undefined
          ? ""
          : `:${evidence.lineStart}${evidence.lineEnd === undefined ? "" : `-${evidence.lineEnd}`}`;
      console.log(`- ${evidence.path}${lines}\n  ${evidence.description}`);
    }
    console.log(
      `Risks:\n${decision.risks.map((risk) => `- ${risk}`).join("\n") || "- (none)"}`
    );
    console.log(
      `Uncertainty:\n${decision.uncertainty.map((item) => `- ${item}`).join("\n") || "- (none)"}`
    );
  }
}
