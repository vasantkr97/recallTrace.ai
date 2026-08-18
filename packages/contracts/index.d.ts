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

export type EvidenceView = {
  content: string;
  occurredAt: string;
  sessionId: string;
};

export type ClaimView = {
  predicate: string;
  label: string;
  value: string;
  status: "current" | "superseded";
  observedAt: string;
  evidence: EvidenceView;
};

export type RecallResult = {
  found: true;
  actor: string;
  predicate: string;
  current: ClaimView;
  previous: ClaimView | null;
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
  recall: RecallResult;
};

export type ApiError = {
  error: string;
  details?: unknown;
};
