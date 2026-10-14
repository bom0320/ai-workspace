export type EvidenceReference = {
  path: string;
  lineStart?: number;
  lineEnd?: number;
  description: string;
};

export type AgentDecision = {
  specialistId: string;
  recommendation: string;
  evidence: EvidenceReference[];
  risks: string[];
  uncertainty: string[];
};
