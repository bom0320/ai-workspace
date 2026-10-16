import type { ComparisonResult } from "@/application/comparison/index.js";

export function presentComparison(comparison: ComparisonResult): void {
  if (comparison.findings.length === 0 && comparison.gaps.length === 0) {
    console.log("\nComparison: no material relationships found.");
    return;
  }
  console.log("\nComparison\n\nFindings:");
  if (comparison.findings.length === 0) console.log("- (none)");
  for (const finding of comparison.findings) {
    console.log(`\n[${finding.relation}] ${finding.concern}`);
    for (const position of finding.positions) {
      console.log(`- ${position.specialistId}: ${position.statement}`);
    }
    console.log(`Rationale: ${finding.rationale}`);
  }
  console.log("\nGaps:");
  if (comparison.gaps.length === 0) console.log("- (none)");
  for (const gap of comparison.gaps) {
    console.log(`\n[${gap.kind}] ${gap.concern}`);
    console.log(`Specialists: ${gap.specialistIds.join(", ")}`);
    console.log(`Reason: ${gap.reason}`);
  }
}
