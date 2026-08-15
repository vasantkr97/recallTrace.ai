import { createHydraDependencies } from "../hydradb/createHydraDependencies.js";

const { connection, claims } = createHydraDependencies();

try {
  await connection.verifyConnectivity();
  await claims.resetMilestoneOneFixture();
  await claims.seedMilestoneOneFixture();

  const history = await claims.getMayaPreferenceHistory();

  if (!history) {
    throw new Error("HydraDB did not return the seeded preference history");
  }

  console.log(JSON.stringify(history, null, 2));
} finally {
  await connection.close();
}
