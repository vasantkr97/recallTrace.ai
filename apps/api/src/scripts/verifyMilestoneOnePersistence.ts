import assert from "node:assert/strict";
import { createHydraDependencies } from "../hydradb/createHydraDependencies.js";

const { connection, claims } = createHydraDependencies();

try {
  await connection.verifyConnectivity();

  const history = await claims.getMayaPreferenceHistory();

  assert.ok(history, "Expected the Milestone 1 graph to survive restart");
  assert.equal(history.current, "light mode");
  assert.equal(history.previous, "dark mode");
  assert.equal(history.relationship, "SUPERSEDES");

  console.log("HydraDB persistence verified.");
  console.log(JSON.stringify(history, null, 2));
} finally {
  await connection.close();
}
