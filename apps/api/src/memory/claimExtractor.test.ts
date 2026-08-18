import assert from "node:assert/strict";
import test from "node:test";
import { StructuredClaimExtractor } from "./claimExtractor.js";

test("extracts the latest value for a canonical slot", () => {
  const extractor = new StructuredClaimExtractor();

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

  assert.deepEqual(result, [
    {
      predicate: "preferred_theme",
      label: "Preferred theme",
      value: "light mode",
      observedAt: "2026-08-18T09:00:00.000Z",
      sourceMessageIndex: 2
    }
  ]);
});

test("extracts multiple structured memories from one conversation", () => {
  const extractor = new StructuredClaimExtractor();

  const result = extractor.extract([
    {
      role: "user",
      content: "I work at Acme and I am building RecallTrace.",
      occurredAt: "2026-08-18T10:00:00.000Z"
    },
    {
      role: "user",
      content: "I live in Bengaluru and I am moving to London next month.",
      occurredAt: "2026-08-18T11:00:00.000Z"
    }
  ]);

  assert.deepEqual(
    result.map(({ predicate, value }) => ({ predicate, value })),
    [
      { predicate: "employer", value: "Acme" },
      { predicate: "active_project", value: "RecallTrace" },
      { predicate: "current_city", value: "Bengaluru" },
      { predicate: "destination_city", value: "London" }
    ]
  );
});

test("does not invent a claim from unrelated conversation", () => {
  const extractor = new StructuredClaimExtractor();
  assert.deepEqual(
    extractor.extract([{ role: "user", content: "How is the weather?" }]),
    []
  );
});
