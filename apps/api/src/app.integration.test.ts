import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { RecallResult } from "@recalltrace/contracts";
import { createApp } from "./app.js";
import { createHydraDependencies } from "./hydradb/createHydraDependencies.js";

test("serves HydraDB health and the Milestone 1 traversal through Express", async () => {
  const dependencies = createHydraDependencies();
  const { connection, claims } = dependencies;
  const app = createApp(dependencies);
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

test("ingests two sessions and recalls the current claim with evidence", async () => {
  const dependencies = createHydraDependencies();
  const { connection } = dependencies;
  const app = createApp(dependencies);
  const server = createServer(app);
  const actorName = `Maya API ${Date.now()}`;

  try {
    await connection.verifyConnectivity();

    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
      server.listen(0, "127.0.0.1");
    });

    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const oldResponse = await postSession(baseUrl, actorName, {
      content: "I prefer dark mode.",
      occurredAt: "2026-08-17T09:00:00.000Z"
    });
    assert.equal(
      oldResponse.status,
      201,
      `first ingestion failed: ${await readFailure(oldResponse)}`
    );

    const currentResponse = await postSession(baseUrl, actorName, {
      content: "I now use light mode because of accessibility.",
      occurredAt: "2026-08-18T09:00:00.000Z"
    });
    assert.equal(
      currentResponse.status,
      201,
      `second ingestion failed: ${await readFailure(currentResponse)}`
    );

    const recallResponse = await fetch(
      `${baseUrl}/api/recall?actor=${encodeURIComponent(actorName)}&predicate=preferred_theme`
    );
    assert.equal(recallResponse.status, 200);

    const recall = (await recallResponse.json()) as RecallResult;
    assert.equal(recall.found, true);
    assert.equal(recall.actor, actorName);
    assert.equal(recall.current.value, "light mode");
    assert.equal(
      recall.current.evidence.content,
      "I now use light mode because of accessibility."
    );
    assert.ok(recall.previous);
    assert.equal(recall.previous.value, "dark mode");
    assert.equal(recall.previous.status, "superseded");
    assert.deepEqual(recall.path.slice(1, 4), [
      "HAS_CLAIM",
      "Claim(preferred_theme=light mode)",
      "SUPPORTED_BY"
    ]);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await connection.close();
  }
});

function postSession(
  baseUrl: string,
  actorName: string,
  message: { content: string; occurredAt: string }
) {
  return fetch(`${baseUrl}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      actorName,
      messages: [{ role: "user", ...message }]
    })
  });
}

async function readFailure(response: Response): Promise<string> {
  return response.ok ? "no error" : response.text();
}
