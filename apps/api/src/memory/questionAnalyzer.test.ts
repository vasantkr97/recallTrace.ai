import assert from "node:assert/strict";
import test from "node:test";
import { QuestionAnalyzer } from "./questionAnalyzer.js";

test("resolves aliases, multiple slots, and previous time intent", () => {
  const analyzer = new QuestionAnalyzer();
  assert.deepEqual(
    analyzer.analyze("Where did Maya live and what was she building previously?"),
    {
      predicates: ["active_project", "current_city"],
      temporalMode: "previous",
      asOf: null,
      looksLikeMemoryQuestion: true
    }
  );
});

test("parses an as-of date and broad profile request", () => {
  const analyzer = new QuestionAnalyzer();
  const result = analyzer.analyze("What do you remember as of 2026-08-15?");
  assert.equal(result.temporalMode, "as_of");
  assert.equal(result.asOf, "2026-08-15T23:59:59.999Z");
  assert.equal(result.predicates.length, 6);
});

test("maps a generic preference question to the canonical theme slot", () => {
  const analyzer = new QuestionAnalyzer();
  const result = analyzer.analyze("What did Maya prefer before?");
  assert.deepEqual(result.predicates, ["preferred_theme"]);
  assert.equal(result.temporalMode, "previous");
});
