import assert from "node:assert/strict";
import test from "node:test";
import type { BenchmarkProfile } from "./types.js";
import { createScenario } from "./scenarios.js";
import { VectorOnlyBaseline } from "./vectorBaseline.js";

const profile: BenchmarkProfile = {
  id: "test",
  actor: "Test Maya",
  originalTheme: "dark mode",
  currentTheme: "light mode",
  originalEmployer: "Acme",
  currentEmployer: "Nova Labs",
  currentCity: "Bengaluru",
  destinationCity: "London",
  project: "Atlas",
  goal: "launch RecallTrace"
};

test("creates a deterministic twelve-question stratified scenario", () => {
  const scenario = createScenario(profile);
  assert.equal(scenario.sessions.length, 7);
  assert.equal(scenario.questions.length, 12);
  assert.deepEqual(
    [...new Set(scenario.questions.map((question) => question.category))].sort(),
    ["absent", "current", "multi_part", "temporal"]
  );
});

test("runs the vector baseline without graph or external model access", () => {
  const scenario = createScenario(profile);
  const baseline = new VectorOnlyBaseline();
  baseline.ingest(scenario.sessions);
  const predictions = scenario.questions.map((question) => baseline.answer(question));
  assert.equal(predictions.length, 12);
  assert.equal(
    predictions.find((prediction) => prediction.questionId.endsWith("absent-food"))
      ?.answered,
    false
  );
});
