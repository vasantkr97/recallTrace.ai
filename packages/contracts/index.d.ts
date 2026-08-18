export type ConversationRole = "user" | "assistant";

export type ConversationMessageInput = {
  role: ConversationRole;
  content: string;
  occurredAt?: string;
};

export type IngestSessionRequest = {
  actorName: string;
  messages: ConversationMessageInput[];
};

export type CanonicalPredicate =
  | "preferred_theme"
  | "employer"
  | "current_city"
  | "destination_city"
  | "active_project"
  | "goal";

export type ClaimStatus =
  | "current"
  | "superseded"
  | "contested"
  | "supporting"
  | "duplicate";

export type MemoryDecision =
  | "NEW"
  | "SUPERSEDES"
  | "CONTRADICTS"
  | "SUPPORTS"
  | "DUPLICATES";

export type EvidenceView = {
  content: string;
  occurredAt: string;
  sessionId: string;
};

export type ClaimView = {
  predicate: CanonicalPredicate;
  label: string;
  value: string;
  status: ClaimStatus;
  observedAt: string;
  evidence: EvidenceView;
};

export type MemoryDecisionView = {
  predicate: CanonicalPredicate;
  label: string;
  value: string;
  decision: MemoryDecision;
  status: ClaimStatus;
};

export type RecallResult = {
  found: true;
  actor: string;
  predicate: string;
  current: ClaimView;
  previous: ClaimView | null;
  history: ClaimView[];
  conflicts: ClaimView[];
  supportingEvidence: EvidenceView[];
  asOf: string | null;
  confidence: number;
  path: string[];
};

export type RecallNotFound = {
  found: false;
  actor: string;
  predicate: string;
  reason: "NO_MATCHING_MEMORY";
};

export type IngestSessionResponse = {
  sessionId: string;
  storedTurns: number;
  extractedClaim: ClaimView;
  extractedClaims: MemoryDecisionView[];
  recall: RecallResult;
};

export type ApiError = {
  error: string;
  details?: unknown;
};
