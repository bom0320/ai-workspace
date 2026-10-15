export type ComparisonRelation = "agreement" | "conflict" | "trade-off";

export type ComparisonGapKind = "uncertainty" | "limitation" | "separate-concern";

export type ComparisonPosition = {
  specialistId: string;
  statement: string;
  // Indexes into the source Specialist's AgentDecision.evidence array (0-based).
  evidenceIndexes: number[];
};

export type ComparisonFinding = {
  concern: string;
  relation: ComparisonRelation;
  positions: ComparisonPosition[];
  rationale: string;
};

export type ComparisonGap = {
  concern: string;
  kind: ComparisonGapKind;
  specialistIds: string[];
  reason: string;
};

export type ComparisonResult = {
  findings: ComparisonFinding[];
  gaps: ComparisonGap[];
};
