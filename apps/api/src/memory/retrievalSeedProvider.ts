import type { CanonicalPredicate } from "@recalltrace/contracts";
import type { QuestionIntent } from "./questionAnalyzer.js";

export type RetrievalSeed = {
  kind: "canonical-slot" | "vector";
  predicate: CanonicalPredicate;
  score: number;
};

/** Allows exact graph seeds to be augmented by vector seeds later. */
export interface RetrievalSeedProvider {
  createSeeds(intent: QuestionIntent): Promise<RetrievalSeed[]>;
}

export class CanonicalSeedProvider implements RetrievalSeedProvider {
  async createSeeds(intent: QuestionIntent): Promise<RetrievalSeed[]> {
    return intent.predicates.map((predicate) => ({
      kind: "canonical-slot",
      predicate,
      score: 1
    }));
  }
}
