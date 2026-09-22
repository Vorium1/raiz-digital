export const CRITICAL_RELEASE_ISSUES = Object.freeze([24, 25, 27] as const);

export type ReleaseIssueState = "open" | "closed" | "unknown";

export type ReleasePromotionGateInput = {
  baseRef: string;
  headRef: string;
  issueStates: Partial<Record<number, ReleaseIssueState>>;
};

export type ReleasePromotionGateResult = {
  applicable: boolean;
  allowed: boolean;
  blockers: string[];
  criticalIssues: readonly number[];
};

export function evaluateReleasePromotionGate(input: ReleasePromotionGateInput): ReleasePromotionGateResult {
  if (input.baseRef !== "main") {
    return {
      applicable: false,
      allowed: true,
      blockers: [],
      criticalIssues: CRITICAL_RELEASE_ISSUES,
    };
  }

  const blockers: string[] = [];

  if (input.headRef !== "develop") {
    blockers.push(`PROMOTION_TO_MAIN_MUST_ORIGINATE_FROM_DEVELOP:${input.headRef || "<empty>"}`);
  }

  for (const issueNumber of CRITICAL_RELEASE_ISSUES) {
    const state = input.issueStates[issueNumber] ?? "unknown";
    if (state === "open") blockers.push(`CRITICAL_RELEASE_ISSUE_OPEN:#${issueNumber}`);
    else if (state !== "closed") blockers.push(`CRITICAL_RELEASE_ISSUE_STATE_UNKNOWN:#${issueNumber}`);
  }

  return {
    applicable: true,
    allowed: blockers.length === 0,
    blockers,
    criticalIssues: CRITICAL_RELEASE_ISSUES,
  };
}
