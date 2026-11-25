import type { ComparisonFinding, ComparisonGap } from "../model/comparison.js";

export type ComparisonResult = {
  findings: ComparisonFinding[];
  gaps: ComparisonGap[];
};
