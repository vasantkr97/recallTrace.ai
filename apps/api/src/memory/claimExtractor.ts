import type { ConversationMessageInput } from "@recalltrace/contracts";

export type ExtractedClaim = {
  predicate: "preferred_theme";
  label: "Preferred theme";
  value: "dark mode" | "light mode";
  observedAt: string;
  sourceMessageIndex: number;
};

export interface ClaimExtractor {
  extract(messages: ConversationMessageInput[]): ExtractedClaim | null;
}

/**
 * Provides a predictable, key-free extractor for the first product slice.
 * A model-backed extractor can implement the same interface in a later milestone.
 */
export class PreferenceClaimExtractor implements ClaimExtractor {
  extract(messages: ConversationMessageInput[]): ExtractedClaim | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];

      if (!message || message.role !== "user") {
        continue;
      }

      const theme = extractTheme(message.content);

      if (theme) {
        return {
          predicate: "preferred_theme",
          label: "Preferred theme",
          value: theme,
          observedAt: message.occurredAt ?? new Date().toISOString(),
          sourceMessageIndex: index
        };
      }
    }

    return null;
  }
}

function extractTheme(content: string): "dark mode" | "light mode" | null {
  const normalized = content.toLowerCase();
  const expressesPreference =
    /\b(?:i\s+(?:now\s+)?(?:prefer|use|switched\s+to)|my\s+(?:preferred\s+)?theme\s+is)\b/.test(
      normalized
    );

  if (!expressesPreference) {
    return null;
  }

  if (/\blight\s+mode\b/.test(normalized)) {
    return "light mode";
  }

  if (/\bdark\s+mode\b/.test(normalized)) {
    return "dark mode";
  }

  return null;
}
