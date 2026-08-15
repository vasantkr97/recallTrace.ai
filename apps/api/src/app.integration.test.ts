import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "./app.js";
import { createHydraDependencies } from "./hydradb/createHydraDependencies.js";

test("serves HydraDB health and the Milestone 1 traversal through Express", async () => {
  const { connection, claims } = createHydraDependencies();
  const app = createApp({ connection, claims });
  const server = createServer(app);

  try {
    await connection.verifyConnectivity();
    await claims.resetMilestoneOneFixture();
    await claims.seedMilestoneOneFixture();

    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
      server.listen(0, "127.0.0.1");
    });

    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const healthResponse = await fetch(`${baseUrl}/health`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), {
      status: "ok",
      hydradb: "connected"
    });

    const milestoneResponse = await fetch(`${baseUrl}/api/milestones/1`);
    assert.equal(milestoneResponse.status, 200);

    const history = (await milestoneResponse.json()) as Record<string, unknown>;
    assert.equal(history.current, "light mode");
    assert.equal(history.previous, "dark mode");
    assert.equal(history.relationship, "SUPERSEDES");
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await connection.close();
  }
});
