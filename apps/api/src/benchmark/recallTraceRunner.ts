import type { CanonicalPredicate } from "@recalltrace/contracts";
import { createHydraDependencies } from "../hydradb/createHydraDependencies.js";
import type {
  BenchmarkPrediction,
  BenchmarkScenario
} from "./types.js";

export async function runRecallTrace(
  scenarios: BenchmarkScenario[],
  runId: string
): Promise<BenchmarkPrediction[]> {
  const dependencies = createHydraDependencies();
  const predictions: BenchmarkPrediction[] = [];

  try {
    await dependencies.connection.verifyConnectivity();

    for (const scenario of scenarios) {
      const actorName = `${scenario.profile.actor} Benchmark ${runId} ${scenario.profile.id}`;

      for (const session of scenario.sessions) {
        await dependencies.memory.ingestSession({
          actorName,
          messages: [{ role: "user", ...session }]
        });
      }

      for (const question of scenario.questions) {
        const startedAt = performance.now();
        const response = await dependencies.answers.answer({
          actorName,
          question: question.question
        });
        const latencyMs = Number((performance.now() - startedAt).toFixed(3));

        if (!response.answered) {
          predictions.push({
            questionId: question.id,
            category: question.category,
            answered: false,
            values: {},
            evidenceCount: 0,
            conflictCount: 0,
            latencyMs,
            reason: response.reason
          });
          continue;
        }

        const values: Partial<Record<CanonicalPredicate, string>> = {};
        for (const item of response.evidence) {
          values[item.claim.predicate] = item.claim.value;
        }
        predictions.push({
          questionId: question.id,
          category: question.category,
          answered: true,
          values,
          evidenceCount: response.evidence.length,
          conflictCount: response.conflicts.length,
          latencyMs
        });
      }
    }

    return predictions;
  } finally {
    await dependencies.connection.close();
  }
}
