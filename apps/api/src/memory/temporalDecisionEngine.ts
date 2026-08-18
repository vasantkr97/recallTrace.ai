import type {
  ClaimStatus,
  ExtractedClaim,
  MemoryDecision
} from "./claimSchema.js";

export type CurrentClaimSnapshot = {
  id: number;
  value: string;
  observedAt: string;
  evidenceContent: string;
};

export type TemporalDecision = {
  decision: MemoryDecision;
  incomingStatus: ClaimStatus;
  replacesCurrent: boolean;
};

export class TemporalDecisionEngine {
  decide(
    incoming: ExtractedClaim,
    current: CurrentClaimSnapshot | null,
    incomingEvidence: string
  ): TemporalDecision {
    if (!current) {
      return decision("NEW", "current", false);
    }

    if (sameValue(incoming.value, current.value)) {
      if (sameEvidence(incomingEvidence, current.evidenceContent)) {
        return decision("DUPLICATES", "duplicate", false);
      }

      return decision("SUPPORTS", "supporting", false);
    }

    if (Date.parse(incoming.observedAt) > Date.parse(current.observedAt)) {
      return decision("SUPERSEDES", "current", true);
    }

    return decision("CONTRADICTS", "contested", false);
  }
}

function decision(
  relation: MemoryDecision,
  incomingStatus: ClaimStatus,
  replacesCurrent: boolean
): TemporalDecision {
  return { decision: relation, incomingStatus, replacesCurrent };
}

function sameValue(left: string, right: string): boolean {
  return normalize(left) === normalize(right);
}

function sameEvidence(left: string, right: string): boolean {
  return normalize(left) === normalize(right);
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[.!?]+$/g, "");
}
