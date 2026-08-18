import type {
  AnswerCoverage,
  AnswerEvidence,
  AskMemoryRequest,
  AskMemoryResponse,
  CanonicalPredicate,
  ClaimView,
  RecallResult,
  RetrievalTraceStep,
  TemporalMode
} from "@recalltrace/contracts";
import type { EntityResolver } from "./entityResolver.js";
import type { MemoryService } from "./memoryService.js";
import type { QuestionAnalyzer } from "./questionAnalyzer.js";
import type { RetrievalSeedProvider } from "./retrievalSeedProvider.js";

type SelectedMemory = {
  predicate: CanonicalPredicate;
  claim: ClaimView;
  recall: RecallResult;
};

export class MemoryAnswerService {
  constructor(
    private readonly memory: MemoryService,
    private readonly questions: QuestionAnalyzer,
    private readonly seeds: RetrievalSeedProvider,
    private readonly entities: EntityResolver
  ) {}

  async answer(request: AskMemoryRequest): Promise<AskMemoryResponse> {
    const startedAt = performance.now();
    const actor = this.entities.resolveActor(request.actorName);
    const intent = this.questions.analyze(request.question, request.asOf);
    const trace: RetrievalTraceStep[] = [
      traceStep(
        "QUESTION_ANALYSIS",
        intent.predicates.length > 0 ? "hit" : "miss",
        intent.predicates.length > 0
          ? `Resolved ${intent.predicates.length} canonical memory slot${intent.predicates.length === 1 ? "" : "s"} with ${intent.temporalMode} time intent.`
          : "No canonical memory slot could be resolved from the question."
      )
    ];

    if (intent.predicates.length === 0) {
      const reason = intent.looksLikeMemoryQuestion
        ? "NO_SUPPORTING_EVIDENCE"
        : "UNSUPPORTED_QUESTION";
      trace.push(
        traceStep("SEED_SELECTION", "miss", "No supported retrieval seed was available."),
        traceStep("GRAPH_TRAVERSAL", "miss", "Graph traversal was skipped because no safe seed was resolved."),
        traceStep("EVIDENCE_SCORING", "miss", "No evidence was selected or scored."),
        traceStep("ANSWER_GENERATION", "miss", "Abstained instead of generating an ungrounded answer.")
      );
      return {
        answered: false,
        question: request.question,
        actor: actor.displayName,
        reason,
        message:
          reason === "NO_SUPPORTING_EVIDENCE"
            ? `RecallTrace has no supported memory slot or evidence for that question about ${actor.displayName}.`
            : "RecallTrace can answer questions about remembered facts, preferences, projects, locations, and goals.",
        temporalMode: intent.temporalMode,
        asOf: intent.asOf,
        coverage: emptyCoverage(),
        trace,
        observability: buildObservability(startedAt, 0, [], 0, 0)
      };
    }

    const seeds = await this.seeds.createSeeds(intent);
    trace.push(
      traceStep(
        "SEED_SELECTION",
        seeds.length > 0 ? "hit" : "miss",
        `Selected ${seeds.length} exact canonical graph seed${seeds.length === 1 ? "" : "s"}: ${seeds.map((seed) => seed.predicate).join(", ")}.`
      )
    );

    const selected: SelectedMemory[] = [];
    const missing: CanonicalPredicate[] = [];

    for (const seed of seeds) {
      const recall = await this.memory.recall(
        actor.displayName,
        seed.predicate,
        intent.temporalMode === "as_of" ? intent.asOf ?? undefined : undefined
      );
      const claim = selectClaim(recall, intent.temporalMode);

      if (!recall || !claim) {
        missing.push(seed.predicate);
        continue;
      }

      selected.push({ predicate: seed.predicate, claim, recall });
    }

    trace.push(
      traceStep(
        "GRAPH_TRAVERSAL",
        selected.length > 0 ? "hit" : "miss",
        `Bounded Actor → Claim → Turn traversal returned ${selected.length} of ${seeds.length} requested memories.`
      )
    );

    const coverage = buildCoverage(
      seeds.map((seed) => seed.predicate),
      selected.map((memory) => memory.predicate),
      missing
    );

    if (selected.length === 0) {
      const historical = intent.temporalMode !== "current";
      trace.push(
        traceStep(
          "EVIDENCE_SCORING",
          "miss",
          "No grounded claim survived temporal selection."
        )
      );
      trace.push(
        traceStep(
          "ANSWER_GENERATION",
          "miss",
          "Abstained because the requested temporal evidence was unavailable."
        )
      );
      return {
        answered: false,
        question: request.question,
        actor: actor.displayName,
        reason: historical
          ? "HISTORICAL_VALUE_NOT_FOUND"
          : "NO_SUPPORTING_EVIDENCE",
        message: historical
          ? `RecallTrace has no evidence for ${actor.displayName} at the requested time.`
          : `RecallTrace has no supporting evidence for ${actor.displayName}.`,
        temporalMode: intent.temporalMode,
        asOf: intent.asOf,
        coverage,
        trace,
        observability: buildObservability(
          startedAt,
          seeds.length,
          selected,
          0,
          0
        )
      };
    }

    const evidence = deduplicateEvidence(selected, actor.displayName);
    const conflicts = deduplicateClaims(
      selected.flatMap((memory) => memory.recall.conflicts)
    );
    const confidence = scoreAnswer(selected, coverage.ratio);
    trace.push(
      traceStep(
        "EVIDENCE_SCORING",
        "hit",
        `Selected ${evidence.length} unique evidence path${evidence.length === 1 ? "" : "s"}; coverage ${Math.round(coverage.ratio * 100)}%, confidence ${Math.round(confidence * 100)}%.`
      )
    );

    const answer = generateGroundedAnswer(
      actor.displayName,
      selected,
      missing,
      intent.temporalMode,
      intent.asOf
    );
    trace.push(
      traceStep(
        "ANSWER_GENERATION",
        "hit",
        "Generated the answer only from selected Claim → SUPPORTED_BY → Turn paths."
      )
    );

    return {
      answered: true,
      question: request.question,
      actor: actor.displayName,
      answer,
      temporalMode: intent.temporalMode,
      asOf: intent.asOf,
      confidence,
      coverage,
      evidence,
      conflicts,
      trace,
      observability: buildObservability(
        startedAt,
        seeds.length,
        selected,
        evidence.length,
        conflicts.length
      )
    };
  }
}

function selectClaim(
  recall: RecallResult | null,
  temporalMode: TemporalMode
): ClaimView | null {
  if (!recall) {
    return null;
  }

  return temporalMode === "previous" ? recall.history[0] ?? null : recall.current;
}

function buildCoverage(
  requested: CanonicalPredicate[],
  answered: CanonicalPredicate[],
  missing: CanonicalPredicate[]
): AnswerCoverage {
  return {
    requested,
    answered,
    missing,
    ratio: requested.length === 0 ? 0 : answered.length / requested.length
  };
}

function emptyCoverage(): AnswerCoverage {
  return { requested: [], answered: [], missing: [], ratio: 0 };
}

function deduplicateEvidence(
  selected: SelectedMemory[],
  actorName: string
): AnswerEvidence[] {
  const unique = new Map<string, AnswerEvidence>();

  for (const memory of selected) {
    const key = `${memory.predicate}:${memory.claim.evidence.sessionId}:${memory.claim.evidence.content}`;
    unique.set(key, {
      claim: memory.claim,
      graphPath: [
        `Actor(${actorName})`,
        "HAS_CLAIM",
        `Claim(${memory.predicate}=${memory.claim.value})`,
        "SUPPORTED_BY",
        "Turn"
      ],
      graphNodeIds: [
        memory.recall.actorGraphId,
        memory.claim.graphId,
        memory.claim.evidence.graphId,
        memory.claim.evidence.sessionGraphId
      ]
    });
  }

  return [...unique.values()];
}

function buildObservability(
  startedAt: number,
  seedsSelected: number,
  selected: SelectedMemory[],
  evidenceSelected: number,
  conflictsFound: number
) {
  const nodes = new Set<string>();
  let edgesTraversed = 0;

  for (const memory of selected) {
    nodes.add(memory.recall.actorGraphId);
    nodes.add(memory.claim.graphId);
    nodes.add(memory.claim.evidence.graphId);
    nodes.add(memory.claim.evidence.sessionGraphId);
    edgesTraversed += 3;
  }

  if (seedsSelected > 0 && nodes.size === 0) {
    nodes.add("actor-seed");
  }

  return {
    seedsSelected,
    nodesTraversed: nodes.size,
    edgesTraversed,
    evidenceSelected,
    conflictsFound,
    latencyMs: Number((performance.now() - startedAt).toFixed(2))
  };
}

function deduplicateClaims(claims: ClaimView[]): ClaimView[] {
  return [
    ...new Map(
      claims.map((claim) => [
        `${claim.predicate}:${claim.observedAt}:${claim.value}`,
        claim
      ])
    ).values()
  ];
}

function scoreAnswer(selected: SelectedMemory[], coverageRatio: number): number {
  const average =
    selected.reduce((total, memory) => total + memory.recall.confidence, 0) /
    selected.length;
  return Number((average * coverageRatio).toFixed(2));
}

function generateGroundedAnswer(
  actor: string,
  selected: SelectedMemory[],
  missing: CanonicalPredicate[],
  temporalMode: TemporalMode,
  asOf: string | null
): string {
  const statements = selected.map(({ predicate, claim }) =>
    sentenceFor(actor, predicate, claim.value, temporalMode, asOf)
  );

  if (missing.length > 0) {
    statements.push(
      `No supporting evidence was found for ${missing.map(readableSlot).join(" or ")}.`
    );
  }

  return statements.join(" ");
}

function sentenceFor(
  actor: string,
  predicate: CanonicalPredicate,
  value: string,
  temporalMode: TemporalMode,
  asOf: string | null
): string {
  if (temporalMode === "current") {
    switch (predicate) {
      case "preferred_theme":
        return `${actor} currently prefers ${value}.`;
      case "employer":
        return `${actor} works at ${value}.`;
      case "current_city":
        return `${actor} lives in ${value}.`;
      case "destination_city":
        return `${actor} is moving to ${value}.`;
      case "active_project":
        return `${actor} is building ${value}.`;
      case "goal":
        return `${actor}'s goal is to ${value}.`;
    }
  }

  const timePrefix = temporalMode === "previous"
    ? "Previously, "
    : `As of ${asOf?.slice(0, 10) ?? "the requested date"}, `;

  switch (predicate) {
    case "preferred_theme":
      return `${timePrefix}${actor} preferred ${value}.`;
    case "employer":
      return `${timePrefix}${actor} worked at ${value}.`;
    case "current_city":
      return `${timePrefix}${actor} lived in ${value}.`;
    case "destination_city":
      return `${timePrefix}${actor} was moving to ${value}.`;
    case "active_project":
      return `${timePrefix}${actor} was building ${value}.`;
    case "goal":
      return `${timePrefix}${actor}'s goal was to ${value}.`;
  }
}

function readableSlot(predicate: CanonicalPredicate): string {
  return predicate.replaceAll("_", " ");
}

function traceStep(
  stage: RetrievalTraceStep["stage"],
  status: RetrievalTraceStep["status"],
  detail: string
): RetrievalTraceStep {
  return { stage, status, detail };
}
