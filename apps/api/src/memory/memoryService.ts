import { randomUUID } from "node:crypto";
import type {
  ConversationMessageInput,
  IngestSessionRequest,
  IngestSessionResponse,
  RecallResult
} from "@recalltrace/contracts";
import type { MemoryRepository } from "../hydradb/memoryRepository.js";
import type { ClaimExtractor } from "./claimExtractor.js";

export class MemoryExtractionError extends Error {
  constructor() {
    super(
      "No supported memory was found. Mention a dark mode or light mode preference."
    );
    this.name = "MemoryExtractionError";
  }
}

export class MemoryService {
  constructor(
    private readonly repository: MemoryRepository,
    private readonly extractor: ClaimExtractor,
    private readonly now: () => Date = () => new Date()
  ) {}

  async ingestSession(
    request: IngestSessionRequest
  ): Promise<IngestSessionResponse> {
    const ingestedAt = this.now().toISOString();
    const messages = addMissingTimestamps(request.messages, ingestedAt);
    const claim = this.extractor.extract(messages);

    if (!claim) {
      throw new MemoryExtractionError();
    }

    const actorName = normalizeActorName(request.actorName);
    const sessionId = randomUUID();

    await this.repository.storeSession({
      actorName,
      normalizedActorName: actorName.toLocaleLowerCase(),
      sessionId,
      ingestedAt,
      messages,
      claim
    });

    const recall = await this.repository.recall(
      actorName.toLocaleLowerCase(),
      claim.predicate
    );

    if (!recall) {
      throw new Error("The stored memory could not be recalled from HydraDB");
    }

    return {
      sessionId,
      storedTurns: messages.length,
      extractedClaim: recall.current,
      recall
    };
  }

  async recall(actorName: string, predicate: string): Promise<RecallResult | null> {
    return this.repository.recall(
      normalizeActorName(actorName).toLocaleLowerCase(),
      predicate.trim().toLocaleLowerCase()
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

function normalizeActorName(actorName: string): string {
  return actorName.trim().replace(/\s+/g, " ");
}
