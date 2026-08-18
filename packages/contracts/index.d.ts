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
  graphId: string;
  sessionGraphId: string;
  content: string;
  occurredAt: string;
  sessionId: string;
};

export type ClaimView = {
  graphId: string;
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
  actorGraphId: string;
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

export type TemporalMode = "current" | "previous" | "as_of";

export type AskMemoryRequest = {
  actorName: string;
  question: string;
  asOf?: string;
};

export type AnswerCoverage = {
  requested: CanonicalPredicate[];
  answered: CanonicalPredicate[];
  missing: CanonicalPredicate[];
  ratio: number;
};

export type AnswerEvidence = {
  claim: ClaimView;
  graphPath: string[];
  graphNodeIds: string[];
};

export type QueryObservability = {
  seedsSelected: number;
  nodesTraversed: number;
  edgesTraversed: number;
  evidenceSelected: number;
  conflictsFound: number;
  latencyMs: number;
};

export type RetrievalTraceStep = {
  stage:
    | "QUESTION_ANALYSIS"
    | "SEED_SELECTION"
    | "GRAPH_TRAVERSAL"
    | "EVIDENCE_SCORING"
    | "ANSWER_GENERATION";
  status: "info" | "hit" | "miss";
  detail: string;
};

export type AskMemoryAnswered = {
  answered: true;
  question: string;
  actor: string;
  answer: string;
  temporalMode: TemporalMode;
  asOf: string | null;
  confidence: number;
  coverage: AnswerCoverage;
  evidence: AnswerEvidence[];
  conflicts: ClaimView[];
  trace: RetrievalTraceStep[];
  observability: QueryObservability;
};

export type AbstentionReason =
  | "UNSUPPORTED_QUESTION"
  | "NO_SUPPORTING_EVIDENCE"
  | "HISTORICAL_VALUE_NOT_FOUND";

export type AskMemoryAbstained = {
  answered: false;
  question: string;
  actor: string;
  reason: AbstentionReason;
  message: string;
  temporalMode: TemporalMode;
  asOf: string | null;
  coverage: AnswerCoverage;
  trace: RetrievalTraceStep[];
  observability: QueryObservability;
};

export type AskMemoryResponse = AskMemoryAnswered | AskMemoryAbstained;

export type GraphNodeKind = "Actor" | "Session" | "Turn" | "Claim";

export type GraphEdgeKind =
  | "HAS_SESSION"
  | "HAS_TURN"
  | "HAS_CLAIM"
  | "SUPPORTED_BY"
  | "SUPERSEDES"
  | "CONTRADICTS"
  | "SUPPORTS"
  | "DUPLICATES";

export type MemoryGraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  occurredAt: string | null;
  status: ClaimStatus | null;
  properties: Record<string, string | number>;
};

export type MemoryGraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: GraphEdgeKind;
  properties: Record<string, string | number>;
};

export type MemoryGraphResponse = {
  actor: string;
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
  timeline: {
    start: string | null;
    end: string | null;
    events: string[];
  };
  stats: {
    actors: number;
    sessions: number;
    turns: number;
    claims: number;
    relationships: number;
    conflicts: number;
  };
};

export type BenchmarkMetricSet = {
  questionAccuracy: number;
  temporalAccuracy: number;
  abstentionAccuracy: number;
  evidencePrecision: number;
  multiPartCoverage: number;
  conflictDetectionAccuracy: number;
  averageLatencyMs: number;
};

export type BenchmarkSummaryResponse = {
  suite: string;
  generatedAt: string;
  questionCount: number;
  datasetLabel: string;
  recallTrace: BenchmarkMetricSet;
  vectorBaseline: BenchmarkMetricSet;
  delta: BenchmarkMetricSet;
  limitations: string[];
};
