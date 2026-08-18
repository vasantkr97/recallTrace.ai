import assert from "node:assert/strict";
import test from "node:test";
import { PreferenceClaimExtractor } from "./claimExtractor.js";

test("extracts the latest supported theme preference with its source turn", () => {
  const extractor = new PreferenceClaimExtractor();

  const result = extractor.extract([
    {
      role: "user",
      content: "I prefer dark mode.",
      occurredAt: "2026-08-17T09:00:00.000Z"
    },
    { role: "assistant", content: "Noted." },
    {
      role: "user",
      content: "I now use light mode because of accessibility.",
      occurredAt: "2026-08-18T09:00:00.000Z"
    }
  ]);

  assert.deepEqual(result, {
    predicate: "preferred_theme",
    label: "Preferred theme",
    value: "light mode",
    observedAt: "2026-08-18T09:00:00.000Z",
    sourceMessageIndex: 2
  });
});

test("does not invent a claim from unrelated conversation", () => {
  const extractor = new PreferenceClaimExtractor();
  assert.equal(
    extractor.extract([{ role: "user", content: "How is the weather?" }]),
    null
  );
});
