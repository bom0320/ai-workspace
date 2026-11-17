import { validateComparisonReferences } from "@/application/comparison/index.js";
import type {
  SynthesisContext,
  CEOSynthesisDecision,
  SourceReference,
} from "./contracts.js";

export function validateSynthesisContext(context: SynthesisContext): void {
  const assignmentIds = new Set(context.assignments.map((a) => a.assignmentId));
  const specialists = new Set(context.assignments.map((a) => a.specialistId));
  const decisionIds = new Set(context.decisions.map((d) => d.specialistId));
  if (
    assignmentIds.size !== context.assignments.length ||
    specialists.size !== context.assignments.length ||
    decisionIds.size !== context.decisions.length ||
    decisionIds.size !== specialists.size ||
    context.decisions.some((d) => !specialists.has(d.specialistId))
  )
    throw new Error(
      "Synthesis requires exactly one Decision per approved Assignment."
    );
  if (context.comparison.status === "skipped") {
    if (context.decisions.length !== 1)
      throw new Error("Only a single Decision may skip Comparison.");
  } else {
    if (context.decisions.length < 2)
      throw new Error("Completed Comparison requires multiple Decisions.");
    validateComparisonReferences(context, context.comparison.comparison);
  }
}

function key(source: SourceReference): string {
  return JSON.stringify(source);
}

export function validateSynthesisSources(
  context: SynthesisContext,
  action: CEOSynthesisDecision
): void {
  const groups =
    action.type === "escalate"
      ? [action.sources]
      : [
          action.proposal.direction.sources,
          action.proposal.rationale.sources,
          ...action.proposal.alternatives.map((a) => a.sources),
          ...action.proposal.tradeoffs.map((s) => s.sources),
          ...action.proposal.risks.map((s) => s.sources),
          ...action.proposal.unresolvedIssues.map((s) => s.sources),
          ...action.proposal.humanReviewItems.map((s) => s.sources),
        ];
  const seen = new Set<string>();
  for (const group of groups) {
    const local = new Set<string>();
    for (const source of group) {
      if (local.has(key(source)))
        throw new Error("Duplicate Synthesis SourceReference.");
      local.add(key(source));
      seen.add(key(source));
      if (source.kind === "finding" || source.kind === "gap") {
        if (
          context.comparison.status !== "completed" ||
          source.index >=
            (source.kind === "finding"
              ? context.comparison.comparison.findings
              : context.comparison.comparison.gaps
            ).length
        )
          throw new Error("Unknown Comparison SourceReference.");
      } else if ("specialistId" in source) {
        const { specialistId } = source;
        const decision = context.decisions.find(
          (d) => d.specialistId === specialistId
        );
        if (!decision) throw new Error("Unknown Specialist SourceReference.");
        if (source.kind !== "recommendation") {
          const items =
            source.kind === "evidence"
              ? decision.evidence
              : source.kind === "risk"
                ? decision.risks
                : decision.uncertainty;
          if (source.index >= items.length)
            throw new Error("Decision SourceReference index is out of range.");
        }
      }
    }
  }
  const required: SourceReference[] = context.decisions.flatMap((decision) => [
    { kind: "recommendation" as const, specialistId: decision.specialistId },
    ...decision.risks.map((_, index) => ({
      kind: "risk" as const,
      specialistId: decision.specialistId,
      index,
    })),
    ...decision.uncertainty.map((_, index) => ({
      kind: "uncertainty" as const,
      specialistId: decision.specialistId,
      index,
    })),
  ]);
  if (context.comparison.status === "completed") {
    context.comparison.comparison.findings.forEach((finding, index) => {
      if (finding.relation !== "agreement")
        required.push({ kind: "finding", index });
    });
    context.comparison.comparison.gaps.forEach((_, index) =>
      required.push({ kind: "gap", index })
    );
  }
  // Coverage is structural traceability, not proof that the CEO resolved a concern correctly.
  if (required.some((source) => !seen.has(key(source))))
    throw new Error(
      "Synthesis omitted a Decision, Risk, Uncertainty, Conflict, Trade-off or Gap source."
    );
}
