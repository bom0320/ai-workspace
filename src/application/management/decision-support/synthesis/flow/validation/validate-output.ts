import type { SynthesisContext } from "../../data-flow/input.js";
import type { CEOSynthesisDecision } from "../../protocol/ceo.js";
import type { SourceReference } from "@/contracts/management/source-reference.js";
import type { SynthesisProposal } from "../../model/proposal.js";

function key(source: SourceReference): string {
  return JSON.stringify(source);
}

// Context and action must already pass their Protocol schemas.
export function validateOutputReferences(
  context: SynthesisContext,
  action: CEOSynthesisDecision
): void {
  const groups =
    action.type === "escalate"
      ? [action.sources]
      : [
          action.proposal.direction.sources,
          ...action.proposal.rationale.map((s) => s.sources),
          ...action.proposal.alternatives.map((a) => a.sources),
          ...action.proposal.tradeoffs.map((s) => s.sources),
          ...action.proposal.risks.map((s) => s.sources),
          ...action.proposal.unresolvedIssues.map((s) => s.sources),
          ...action.proposal.humanReviewItems.map((s) => s.sources),
        ];
  for (const group of groups) validateAnalysisReferences(context, group);
}

export function validateAnalysisReferences(
  context: SynthesisContext,
  group: SourceReference[]
): void {
  const local = new Set<string>();
  for (const source of group) {
    if (local.has(key(source)))
      throw new Error("Duplicate Synthesis SourceReference.");
    local.add(key(source));
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

export function validateProposalCoverage(
  context: SynthesisContext,
  proposal: SynthesisProposal
): void {
  // One Comparison concern per treatment prevents a catch-all citation dump.
  // Several related Risks/Uncertainties may share one explanation without repeating source text.
  const treatments = [
    proposal.direction,
    ...proposal.rationale,
    ...proposal.tradeoffs,
    ...proposal.risks,
    ...proposal.unresolvedIssues,
    ...proposal.humanReviewItems,
  ];
  for (const treatment of treatments) {
    if (
      treatment.sources.filter((s) => s.kind === "finding" || s.kind === "gap")
        .length > 1
    )
      throw new Error("Explain each Comparison concern in its own treatment.");
  }
  const has = (
    groups: { sources: SourceReference[] }[],
    source: SourceReference
  ) =>
    groups.some((group) => group.sources.some((s) => key(s) === key(source)));
  if (context.comparison.status === "completed") {
    context.comparison.comparison.findings.forEach((finding, index) => {
      if (finding.relation === "agreement") return;
      const groups =
        finding.relation === "trade-off"
          ? [
              ...proposal.tradeoffs,
              ...proposal.rationale,
              ...proposal.unresolvedIssues,
            ]
          : [...proposal.rationale, ...proposal.unresolvedIssues];
      if (!has(groups, { kind: "finding", index }))
        throw new Error(
          "Missing reasoned treatment of a Conflict or Trade-off."
        );
    });
    context.comparison.comparison.gaps.forEach((_, index) => {
      if (
        !has([...proposal.rationale, ...proposal.unresolvedIssues], {
          kind: "gap",
          index,
        })
      )
        throw new Error("Missing reasoned treatment of a Comparison Gap.");
    });
  }
  for (const decision of context.decisions) {
    decision.risks.forEach((_, index) => {
      if (
        !has([...proposal.risks, ...proposal.unresolvedIssues], {
          kind: "risk",
          specialistId: decision.specialistId,
          index,
        })
      )
        throw new Error(
          "Original Risk has no risk or unresolved-issue treatment."
        );
    });
    decision.uncertainty.forEach((_, index) => {
      if (
        !has(proposal.unresolvedIssues, {
          kind: "uncertainty",
          specialistId: decision.specialistId,
          index,
        })
      )
        throw new Error(
          "Original Uncertainty has no unresolved-issue treatment."
        );
    });
  }
  // This checks treatment placement and traceability, not the truth or adequacy of its prose.
}
