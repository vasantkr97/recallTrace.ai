import type {
  CanonicalPredicate,
  TemporalMode
} from "@recalltrace/contracts";

export type QuestionIntent = {
  predicates: CanonicalPredicate[];
  temporalMode: TemporalMode;
  asOf: string | null;
  looksLikeMemoryQuestion: boolean;
};

type SlotRule = {
  predicate: CanonicalPredicate;
  patterns: RegExp[];
};

const slotRules: SlotRule[] = [
  {
    predicate: "destination_city",
    patterns: [/\bmoving\b/i, /\bmove\s+to\b/i, /\brelocat(?:e|ing|ion)\b/i]
  },
  {
    predicate: "active_project",
    patterns: [/\bbuilding\b/i, /\bworking\s+on\b/i, /\bactive\s+project\b/i]
  },
  {
    predicate: "preferred_theme",
    patterns: [
      /\btheme\b/i,
      /\b(?:dark|light)\s+mode\b/i,
      /\bappearance\s+preference\b/i,
      /\bprefer(?:s|red|ence)?\b/i
    ]
  },
  {
    predicate: "employer",
    patterns: [/\bwork(?:s|ed|ing)?\s+at\b/i, /\bemployer\b/i, /\bcompany\b/i]
  },
  {
    predicate: "current_city",
    patterns: [
      /\blive(?:s|d|ing)?(?:\s+in)?\b/i,
      /\bcurrent\s+city\b/i,
      /\blocation\b/i
    ]
  },
  {
    predicate: "goal",
    patterns: [/\bgoal\b/i, /\btrying\s+to\b/i, /\bwant(?:s|ed)?\s+to\s+achieve\b/i]
  }
];

const allPredicates = slotRules.map((rule) => rule.predicate);

export class QuestionAnalyzer {
  analyze(question: string, explicitAsOf?: string): QuestionIntent {
    const predicates = isBroadMemoryQuestion(question)
      ? [...allPredicates]
      : slotRules
          .filter((rule) => rule.patterns.some((pattern) => pattern.test(question)))
          .map((rule) => rule.predicate);
    const parsedAsOf = explicitAsOf ?? parseAsOf(question);
    const temporalMode = parsedAsOf
      ? "as_of"
      : asksForPreviousValue(question)
        ? "previous"
        : "current";

    return {
      predicates: [...new Set(predicates)],
      temporalMode,
      asOf: parsedAsOf ?? null,
      looksLikeMemoryQuestion: /\b(?:what|where|who|which|when|does|did|is|was|tell me)\b/i.test(
        question
      )
    };
  }
}

function asksForPreviousValue(question: string): boolean {
  return /\b(?:previous|previously|before|used\s+to|prior|originally|last\s+time)\b/i.test(
    question
  );
}

function isBroadMemoryQuestion(question: string): boolean {
  return /\b(?:what\s+do\s+you\s+know|summari[sz]e\s+(?:my|their|the)\s+(?:memory|profile)|what\s+do\s+you\s+remember)\b/i.test(
    question
  );
}

function parseAsOf(question: string): string | undefined {
  const date = question.match(/\bas\s+of\s+(\d{4}-\d{2}-\d{2})\b/i)?.[1];
  return date ? `${date}T23:59:59.999Z` : undefined;
}
