import type { CanonicalPredicate } from "@recalltrace/contracts";
import { StructuredClaimExtractor } from "../memory/claimExtractor.js";
import { QuestionAnalyzer } from "../memory/questionAnalyzer.js";
import type {
  BenchmarkPrediction,
  BenchmarkQuestion,
  BenchmarkSession
} from "./types.js";

type VectorEntry = {
  session: BenchmarkSession;
  vector: Float64Array;
};

type RankedClaim = {
  predicate: CanonicalPredicate;
  value: string;
  content: string;
};

const dimensions = 512;
const topK = 4;

/**
 * A deliberately transparent vector-only baseline: raw turns are embedded as
 * hashed token vectors and retrieved by cosine similarity. It has timestamp
 * filtering but no graph, canonical history, or conflict relationships.
 */
export class VectorOnlyBaseline {
  private readonly analyzer = new QuestionAnalyzer();
  private readonly extractor = new StructuredClaimExtractor();
  private entries: VectorEntry[] = [];

  ingest(sessions: BenchmarkSession[]): void {
    this.entries = sessions.map((session) => ({
      session,
      vector: embed(session.content)
    }));
  }

  answer(question: BenchmarkQuestion): BenchmarkPrediction {
    const startedAt = performance.now();
    const intent = this.analyzer.analyze(question.question);

    if (intent.predicates.length === 0) {
      return prediction(question, startedAt, false, {}, 0, "NO_VECTOR_MATCH");
    }

    const queryVector = embed(expandQuery(question.question, intent.predicates));
    const cutoff = intent.asOf ? Date.parse(intent.asOf) : Number.POSITIVE_INFINITY;
    const ranked = this.entries
      .filter((entry) => Date.parse(entry.session.occurredAt) <= cutoff)
      .map((entry) => ({
        entry,
        score: cosine(queryVector, entry.vector)
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
    const rankedClaims = ranked.flatMap(({ entry }) =>
      this.extractor
        .extract([
          {
            role: "user",
            content: entry.session.content,
            occurredAt: entry.session.occurredAt
          }
        ])
        .map(
          (claim): RankedClaim => ({
            predicate: claim.predicate,
            value: claim.value,
            content: entry.session.content
          })
        )
    );
    const values: Partial<Record<CanonicalPredicate, string>> = {};
    const evidence = new Set<string>();

    for (const predicate of intent.predicates) {
      const candidates = distinctValues(
        rankedClaims.filter((claim) => claim.predicate === predicate)
      );
      const selected =
        intent.temporalMode === "previous" ? candidates[1] : candidates[0];

      if (selected) {
        values[predicate] = selected.value;
        evidence.add(selected.content);
      }
    }

    const answered = Object.keys(values).length > 0;
    return prediction(
      question,
      startedAt,
      answered,
      values,
      evidence.size,
      answered ? undefined : "NO_VECTOR_MATCH"
    );
  }
}

function distinctValues(claims: RankedClaim[]): RankedClaim[] {
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = claim.value.trim().toLocaleLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function prediction(
  question: BenchmarkQuestion,
  startedAt: number,
  answered: boolean,
  values: Partial<Record<CanonicalPredicate, string>>,
  evidenceCount: number,
  reason?: "NO_VECTOR_MATCH"
): BenchmarkPrediction {
  return {
    questionId: question.id,
    category: question.category,
    answered,
    values,
    evidenceCount,
    conflictCount: 0,
    latencyMs: Number((performance.now() - startedAt).toFixed(3)),
    ...(reason ? { reason } : {})
  };
}

function expandQuery(
  question: string,
  predicates: CanonicalPredicate[]
): string {
  const aliases: Record<CanonicalPredicate, string> = {
    preferred_theme: "theme preference dark mode light mode",
    employer: "employer company work joined",
    current_city: "current city location live",
    destination_city: "destination moving relocate",
    active_project: "active project building working",
    goal: "goal achieve ambition"
  };
  return `${question} ${predicates.map((predicate) => aliases[predicate]).join(" ")}`;
}

function embed(text: string): Float64Array {
  const vector = new Float64Array(dimensions);
  const tokens = tokenize(text);
  const features = [
    ...tokens,
    ...tokens.slice(0, -1).map((token, index) => `${token}_${tokens[index + 1]}`)
  ];

  for (const feature of features) {
    const index = hash(feature) % dimensions;
    vector[index] = (vector[index] ?? 0) + 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (magnitude > 0) {
    for (let index = 0; index < vector.length; index += 1) {
      vector[index] = (vector[index] ?? 0) / magnitude;
    }
  }

  return vector;
}

function tokenize(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

function hash(value: string): number {
  let result = 2_166_136_261;

  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16_777_619);
  }

  return result >>> 0;
}

function cosine(left: Float64Array, right: Float64Array): number {
  let score = 0;

  for (let index = 0; index < dimensions; index += 1) {
    score += (left[index] ?? 0) * (right[index] ?? 0);
  }

  return score;
}
