import assert from "node:assert/strict";
import test from "node:test";
import { createHydraDependencies } from "./createHydraDependencies.js";

test("stores and traverses an immutable preference supersession", async () => {
  const { connection, claims } = createHydraDependencies();

  try {
    await connection.verifyConnectivity();
    await claims.resetMilestoneOneFixture();
    await claims.seedMilestoneOneFixture();

    const history = await claims.getMayaPreferenceHistory();

    assert.deepEqual(history, {
      actor: "Maya",
      current: "light mode",
      previous: "dark mode",
      relationship: "SUPERSEDES",
      currentStatus: "current",
      previousStatus: "superseded",
      currentEvidence: "I now use light mode because of accessibility.",
      previousEvidence: "I prefer dark mode.",
      changedAt: "2026-08-14T11:30:00.000Z"
    });
  } finally {
    await connection.close();
  }
});
