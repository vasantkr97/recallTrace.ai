import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveProjectPath } from "../config/environment.js";
import { evaluateSystem } from "./evaluator.js";
import { runRecallTrace } from "./recallTraceRunner.js";
import { createScenario } from "./scenarios.js";
import {
  benchmarkFixtureSchema,
  type BenchmarkMetrics,
  type BenchmarkPrediction,
  type BenchmarkReport
} from "./types.js";
import { VectorOnlyBaseline } from "./vectorBaseline.js";

const smoke = process.argv.includes("--smoke");
const suite = smoke ? "smoke" : "full";
const fixturePath = resolveProjectPath("benchmarks", "fixtures", "profiles.json");
const fixture = benchmarkFixtureSchema.parse(
  JSON.parse(await readFile(fixturePath, "utf8"))
);
const profiles = smoke ? fixture.profiles.slice(0, 1) : fixture.profiles;
const scenarios = profiles.map(createScenario);
const runId = `${Date.now()}`;

const recallTracePredictions = await runRecallTrace(scenarios, runId);
const vectorPredictions: BenchmarkPrediction[] = [];

for (const scenario of scenarios) {
  const baseline = new VectorOnlyBaseline();
  baseline.ingest(scenario.sessions);
  vectorPredictions.push(
    ...scenario.questions.map((question) => baseline.answer(question))
  );
}

const recallTrace = evaluateSystem(
  "RecallTrace",
  "Canonical temporal claims retrieved through bounded HydraDB graph paths.",
  scenarios,
  recallTracePredictions
);
const vectorBaseline = evaluateSystem(
  "Vector-only cosine baseline",
  "Raw turns embedded into 512-dimensional hashed token vectors; top-4 cosine retrieval with timestamp filtering and no graph relationships.",
  scenarios,
  vectorPredictions
);
const report: BenchmarkReport = {
  metadata: {
    suite,
    fixtureVersion: fixture.version,
    generatedAt: new Date().toISOString(),
    profileCount: scenarios.length,
    questionCount: scenarios.reduce(
      (total, scenario) => total + scenario.questions.length,
      0
    ),
    datasetLabel: "RecallTrace fixed synthetic temporal-memory suite v1",
    methodology:
      "Both systems receive identical conversations, timestamps, questions, canonical extraction rules, and expected values. Only retrieval architecture differs.",
    limitations: [
      "This is a deterministic synthetic development suite, not a public LongMemEval result.",
      "The vector baseline uses disclosed hashed token vectors rather than a commercial embedding model.",
      "Latency is measured on one local machine and should be treated as directional."
    ]
  },
  recallTrace,
  vectorBaseline,
  delta: metricDelta(recallTrace.metrics, vectorBaseline.metrics),
  failureAnalysis: {
    recallTraceFailures: recallTrace.cases.filter((item) => !item.correct).length,
    vectorBaselineFailures: vectorBaseline.cases.filter((item) => !item.correct).length,
    vectorFailuresByCategory: countFailuresByCategory(vectorBaseline.cases)
  }
};
const resultsDirectory = resolveProjectPath("benchmarks", "results");
const outputPath = path.join(resultsDirectory, `${suite}.json`);

await mkdir(resultsDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`RecallTrace ${suite} benchmark complete: ${report.metadata.questionCount} questions.`);
console.table({
  RecallTrace: report.recallTrace.metrics,
  "Vector baseline": report.vectorBaseline.metrics,
  Delta: report.delta
});
console.log(`Machine-readable report: ${outputPath}`);

function metricDelta(
  recallTraceMetrics: BenchmarkMetrics,
  baselineMetrics: BenchmarkMetrics
): Record<keyof BenchmarkMetrics, number> {
  return Object.fromEntries(
    (Object.keys(recallTraceMetrics) as Array<keyof BenchmarkMetrics>).map(
      (key) => [
        key,
        Number((recallTraceMetrics[key] - baselineMetrics[key]).toFixed(4))
      ]
    )
  ) as Record<keyof BenchmarkMetrics, number>;
}

function countFailuresByCategory(
  cases: typeof vectorBaseline.cases
): BenchmarkReport["failureAnalysis"]["vectorFailuresByCategory"] {
  const counts: BenchmarkReport["failureAnalysis"]["vectorFailuresByCategory"] = {};

  for (const item of cases.filter((candidate) => !candidate.correct)) {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
  }

  return counts;
}
