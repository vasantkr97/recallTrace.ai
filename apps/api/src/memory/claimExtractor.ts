import type { ConversationMessageInput } from "@recalltrace/contracts";
import {
  extractedClaimSchema,
  slotLabels,
  type CanonicalPredicate,
  type ExtractedClaim
} from "./claimSchema.js";

export interface ClaimExtractor {
  extract(messages: ConversationMessageInput[]): ExtractedClaim[];
}

type Candidate = {
  predicate: CanonicalPredicate;
  value: string;
};

/**
 * A deterministic structured extractor for the hackathon's golden paths.
 * Its output is schema-validated and its interface can later be implemented
 * by an LLM without changing storage, temporal decisions, or retrieval.
 */
export class StructuredClaimExtractor implements ClaimExtractor {
  extract(messages: ConversationMessageInput[]): ExtractedClaim[] {
    const latestBySlot = new Map<CanonicalPredicate, ExtractedClaim>();

    messages.forEach((message, sourceMessageIndex) => {
      if (message.role !== "user") {
        return;
      }

      for (const candidate of extractCandidates(message.content)) {
        const claim = extractedClaimSchema.parse({
          ...candidate,
          label: slotLabels[candidate.predicate],
          observedAt: message.occurredAt ?? new Date().toISOString(),
          sourceMessageIndex
        });
        latestBySlot.set(candidate.predicate, claim);
      }
    });

    return [...latestBySlot.values()].sort(
      (left, right) => left.sourceMessageIndex - right.sourceMessageIndex
    );
  }
}

function extractCandidates(content: string): Candidate[] {
  const candidates: Candidate[] = [];
  const theme = content.match(/\b(?:dark|light)\s+mode\b/i)?.[0];

  if (theme && expressesThemePreference(content)) {
    candidates.push({
      predicate: "preferred_theme",
      value: theme.toLocaleLowerCase().replace(/\s+/g, " ")
    });
  }

  pushMatch(
    candidates,
    "employer",
    content,
    /\bi\s+(?:now\s+)?(?:work\s+at|joined)\s+([^,.!?]+?)(?=\s+and\s+i\b|[,.!?]|$)/i
  );
  pushMatch(
    candidates,
    "current_city",
    content,
    /\bi\s+(?:now\s+)?(?:live\s+in|moved\s+to)\s+([^,.!?]+?)(?=\s+and\s+i\b|[,.!?]|$)/i
  );
  pushMatch(
    candidates,
    "destination_city",
    content,
    /\bi(?:'m|\s+am)\s+moving\s+to\s+([^,.!?]+?)(?=\s+(?:next\s+(?:week|month|year)|soon)\b|\s+and\s+i\b|[,.!?]|$)/i
  );
  pushMatch(
    candidates,
    "active_project",
    content,
    /\bi(?:'m|\s+am)\s+(?:currently\s+)?building\s+([^,.!?]+?)(?=\s+and\s+i\b|[,.!?]|$)/i
  );
  pushMatch(
    candidates,
    "goal",
    content,
    /\bmy\s+goal\s+is\s+to\s+([^.!?]+?)(?=[.!?]|$)/i
  );

  return candidates;
}

function expressesThemePreference(content: string): boolean {
  return /\b(?:i\s+(?:now\s+)?(?:prefer|use|switched\s+to)|my\s+(?:preferred\s+)?theme\s+is)\b/i.test(
    content
  );
}

function pushMatch(
  candidates: Candidate[],
  predicate: CanonicalPredicate,
  content: string,
  pattern: RegExp
): void {
  const value = content.match(pattern)?.[1]?.trim();

  if (value) {
    candidates.push({ predicate, value: stripTrailingConnector(value) });
  }
}

function stripTrailingConnector(value: string): string {
  return value.replace(/\s+(?:because|since)\s+.*$/i, "").trim();
}
