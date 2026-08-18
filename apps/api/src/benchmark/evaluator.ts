import type {
  BenchmarkMetrics,
  BenchmarkPrediction,
  BenchmarkScenario,
  CaseEvaluation,
  EvaluatedSystem
} from "./types.js";

export function evaluateSystem(
  system: string,
  description: string,
  scenarios: BenchmarkScenario[],
  predictions: BenchmarkPrediction[]
): EvaluatedSystem {
  const predictionById = new Map(
    predictions.map((prediction) => [prediction.questionId, prediction])
  );
  const cases: CaseEvaluation[] = scenarios.flatMap((scenario) =>
    scenario.questions.map((question) => {
      const prediction = predictionById.get(question.id);

      if (!prediction) {
        throw new Error(`${system} did not return a prediction for ${question.id}`);
      }

      const expectedEntries = Object.entries(question.expected.values);
      const matchedValues = expectedEntries.filter(
        ([predicate, expected]) =>
          normalize(prediction.values[predicate as keyof typeof prediction.values]) ===
          normalize(expected)
      ).length;
      const conflictRequirementMet =
        prediction.conflictCount >= (question.expected.minimumConflicts ?? 0);
      const correct = question.expected.answered
        ? prediction.answered &&
          matchedValues === expectedEntries.length &&
          conflictRequirementMet
        : !prediction.answered;

      return {
        ...prediction,
        correct,
        expectedAnswered: question.expected.answered,
        expectedValues: question.expected.values,
        matchedValues,
        expectedValueCount: expectedEntries.length
      };
    })
  );

  return {
    system,
    description,
    metrics: calculateMetrics(cases),
    cases
  };
}

function calculateMetrics(cases: CaseEvaluation[]): BenchmarkMetrics {
  const temporal = cases.filter((item) => item.category === "temporal");
  const absent = cases.filter((item) => item.category === "absent");
  const multiPart = cases.filter((item) => item.category === "multi_part");
  const conflicts = cases.filter((item) =>
    item.questionId.endsWith("current-theme")
  );
  const predictedValues = cases.flatMap((item) => Object.entries(item.values));
  const correctPredictedValues = cases.reduce(
    (total, item) => total + item.matchedValues,
    0
  );
  const multiMatched = multiPart.reduce(
    (total, item) => total + item.matchedValues,
    0
  );
  const multiExpected = multiPart.reduce(
    (total, item) => total + item.expectedValueCount,
    0
  );

  return {
    questionAccuracy: ratio(cases.filter((item) => item.correct).length, cases.length),
    temporalAccuracy: ratio(
      temporal.filter((item) => item.correct).length,
      temporal.length
    ),
    abstentionAccuracy: ratio(
      absent.filter((item) => item.correct).length,
      absent.length
    ),
    evidencePrecision: ratio(correctPredictedValues, predictedValues.length),
    multiPartCoverage: ratio(multiMatched, multiExpected),
    conflictDetectionAccuracy: ratio(
      conflicts.filter((item) => item.conflictCount >= 1).length,
      conflicts.length
    ),
    averageLatencyMs: round(
      cases.reduce((total, item) => total + item.latencyMs, 0) / cases.length
    )
  };
}

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round(numerator / denominator);
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
