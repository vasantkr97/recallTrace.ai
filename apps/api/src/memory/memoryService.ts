import { randomUUID } from "node:crypto";
import type {
  ConversationMessageInput,
  IngestSessionRequest,
  IngestSessionResponse,
  RecallResult
} from "@recalltrace/contracts";
import type { MemoryRepository } from "../hydradb/memoryRepository.js";
import type { ClaimExtractor } from "./claimExtractor.js";
import type { CanonicalPredicate } from "./claimSchema.js";
import type { EntityResolver } from "./entityResolver.js";

export class MemoryExtractionError extends Error {
  constructor() {
    super(
      "No supported memory was found. Mention a preference, employer, city, project, destination, or goal."
    );
    this.name = "MemoryExtractionError";
  }
}

export class MemoryService {
  constructor(
    private readonly repository: MemoryRepository,
    private readonly extractor: ClaimExtractor,
    private readonly entities: EntityResolver,
    private readonly now: () => Date = () => new Date()
  ) {}

  async ingestSession(
    request: IngestSessionRequest
  ): Promise<IngestSessionResponse> {
    const ingestedAt = this.now().toISOString();
    const messages = addMissingTimestamps(request.messages, ingestedAt);
    const claims = this.extractor.extract(messages);

    if (claims.length === 0) {
      throw new MemoryExtractionError();
    }

    const actor = this.entities.resolveActor(request.actorName);
    const sessionId = randomUUID();

    const outcome = await this.repository.storeSession({
      actorName: actor.displayName,
      normalizedActorName: actor.canonicalKey,
      sessionId,
      ingestedAt,
      messages,
      claims
    });

    const primaryClaim = claims.at(-1)!;

    const recall = await this.repository.recall(
      actor.canonicalKey,
      primaryClaim.predicate
    );

    if (!recall) {
      throw new Error("The stored memory could not be recalled from HydraDB");
    }

    return {
      sessionId,
      storedTurns: messages.length,
      extractedClaim: recall.current,
      extractedClaims: outcome.decisions,
      recall
    };
  }

  async recall(
    actorName: string,
    predicate: CanonicalPredicate,
    asOf?: string
  ): Promise<RecallResult | null> {
    const actor = this.entities.resolveActor(actorName);
    return this.repository.recall(
      actor.canonicalKey,
      predicate,
      asOf
    );
  }
}

function addMissingTimestamps(
  messages: ConversationMessageInput[],
  fallback: string
): ConversationMessageInput[] {
  return messages.map((message) => ({
    ...message,
    occurredAt: message.occurredAt ?? fallback
  }));
}
