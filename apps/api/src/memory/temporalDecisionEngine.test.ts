import assert from "node:assert/strict";
import test from "node:test";
import type { ExtractedClaim } from "./claimSchema.js";
import { TemporalDecisionEngine } from "./temporalDecisionEngine.js";

const incoming: ExtractedClaim = {
  predicate: "preferred_theme",
  label: "Preferred theme",
  value: "light mode",
  observedAt: "2026-08-18T09:00:00.000Z",
  sourceMessageIndex: 0
};

const current = {
  id: 1,
  value: "dark mode",
  observedAt: "2026-08-17T09:00:00.000Z",
  evidenceContent: "I prefer dark mode."
};

test("classifies every temporal relationship deterministically", () => {
  const engine = new TemporalDecisionEngine();

  assert.deepEqual(engine.decide(incoming, null, "I prefer light mode."), {
    decision: "NEW",
    incomingStatus: "current",
    replacesCurrent: false
  });

  assert.deepEqual(engine.decide(incoming, current, "I prefer light mode."), {
    decision: "SUPERSEDES",
    incomingStatus: "current",
    replacesCurrent: true
  });

  assert.deepEqual(
    engine.decide(
      { ...incoming, observedAt: "2026-08-16T09:00:00.000Z" },
      current,
      "An older note says light mode."
    ),
    {
      decision: "CONTRADICTS",
      incomingStatus: "contested",
      replacesCurrent: false
    }
  );

  assert.deepEqual(
    engine.decide(
      { ...incoming, value: "dark mode" },
      current,
      "Dark mode is still best for me."
    ),
    {
      decision: "SUPPORTS",
      incomingStatus: "supporting",
      replacesCurrent: false
    }
  );

  assert.deepEqual(
    engine.decide(
      { ...incoming, value: "dark mode" },
      current,
      "I prefer dark mode."
    ),
    {
      decision: "DUPLICATES",
      incomingStatus: "duplicate",
      replacesCurrent: false
    }
  );
});
