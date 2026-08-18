import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type {
  AskMemoryResponse,
  IngestSessionResponse,
  RecallResult
} from "@recalltrace/contracts";
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

test("classifies graph events and answers an as-of recall", async () => {
  const dependencies = createHydraDependencies();
  const { connection } = dependencies;
  const app = createApp(dependencies);
  const server = createServer(app);
  const actorName = `Temporal Maya ${Date.now()}`;

  try {
    await connection.verifyConnectivity();
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
      server.listen(0, "127.0.0.1");
    });

    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const first = await postSession(baseUrl, actorName, {
      content: "I work at Acme and I prefer dark mode.",
      occurredAt: "2026-08-10T09:00:00.000Z"
    });
    assert.equal(first.status, 201, await readFailure(first));
    const firstBody = (await first.json()) as IngestSessionResponse;
    assert.deepEqual(
      firstBody.extractedClaims.map(({ predicate, decision }) => ({
        predicate,
        decision
      })),
      [
        { predicate: "preferred_theme", decision: "NEW" },
        { predicate: "employer", decision: "NEW" }
      ]
    );

    const update = await postSession(baseUrl, actorName, {
      content: "I now use light mode because of accessibility.",
      occurredAt: "2026-08-18T09:00:00.000Z"
    });
    assert.equal(update.status, 201, await readFailure(update));
    assert.equal(
      ((await update.json()) as IngestSessionResponse).extractedClaims[0]
        ?.decision,
      "SUPERSEDES"
    );

    const conflict = await postSession(baseUrl, actorName, {
      content: "I prefer dark mode.",
      occurredAt: "2026-08-11T09:00:00.000Z"
    });
    assert.equal(conflict.status, 201, await readFailure(conflict));
    assert.equal(
      ((await conflict.json()) as IngestSessionResponse).extractedClaims[0]
        ?.decision,
      "CONTRADICTS"
    );

    const support = await postSession(baseUrl, actorName, {
      content: "I use light mode because it reduces eye strain.",
      occurredAt: "2026-08-19T09:00:00.000Z"
    });
    assert.equal(support.status, 201, await readFailure(support));
    assert.equal(
      ((await support.json()) as IngestSessionResponse).extractedClaims[0]
        ?.decision,
      "SUPPORTS"
    );

    const duplicate = await postSession(baseUrl, actorName, {
      content: "I now use light mode because of accessibility.",
      occurredAt: "2026-08-20T09:00:00.000Z"
    });
    assert.equal(duplicate.status, 201, await readFailure(duplicate));
    assert.equal(
      ((await duplicate.json()) as IngestSessionResponse).extractedClaims[0]
        ?.decision,
      "DUPLICATES"
    );

    const recallResponse = await fetch(
      `${baseUrl}/api/recall?actor=${encodeURIComponent(actorName)}&predicate=preferred_theme`
    );
    const recall = (await recallResponse.json()) as RecallResult;
    assert.equal(recall.current.value, "light mode");
    assert.equal(recall.history[0]?.value, "dark mode");
    assert.equal(recall.conflicts[0]?.value, "dark mode");
    assert.equal(recall.supportingEvidence.length, 2);
    assert.ok(recall.confidence < 0.9);

    for (const relationship of [
      "SUPERSEDES",
      "CONTRADICTS",
      "SUPPORTS",
      "DUPLICATES"
    ] as const) {
      const edge = await connection.read(`
MATCH
  (actor:Actor {normalizedName: $actor})-[:HAS_CLAIM]->(incoming:Claim)-[:${relationship}]->(existing:Claim)
RETURN incoming.value AS incoming, existing.value AS existing
LIMIT 1
`, { actor: actorName.toLocaleLowerCase() });
      assert.equal(
        edge.records.length,
        1,
        `${relationship} was not persisted in HydraDB`
      );
    }

    const asOf = encodeURIComponent("2026-08-15T00:00:00.000Z");
    const historicalResponse = await fetch(
      `${baseUrl}/api/recall?actor=${encodeURIComponent(actorName)}&predicate=preferred_theme&asOf=${asOf}`
    );
    assert.equal(historicalResponse.status, 200);
    const historical = (await historicalResponse.json()) as RecallResult;
    assert.equal(historical.current.value, "dark mode");
    assert.equal(historical.asOf, "2026-08-15T00:00:00.000Z");
    assert.equal(historical.conflicts.length, 0);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await connection.close();
  }
});

test("answers grounded natural-language questions and abstains safely", async () => {
  const dependencies = createHydraDependencies();
  const { connection } = dependencies;
  const app = createApp(dependencies);
  const server = createServer(app);
  const actorName = `Question Maya ${Date.now()}`;

  try {
    await connection.verifyConnectivity();
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
      server.listen(0, "127.0.0.1");
    });

    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    await postSession(baseUrl, actorName, {
      content: "I work at Acme and I prefer dark mode.",
      occurredAt: "2026-08-10T09:00:00.000Z"
    });
    await postSession(baseUrl, actorName, {
      content: "I am building RecallTrace and I live in Bengaluru.",
      occurredAt: "2026-08-12T09:00:00.000Z"
    });
    await postSession(baseUrl, actorName, {
      content: "I am moving to London next month.",
      occurredAt: "2026-08-14T09:00:00.000Z"
    });
    await postSession(baseUrl, actorName, {
      content: "I now use light mode because of accessibility.",
      occurredAt: "2026-08-18T09:00:00.000Z"
    });

    const current = await postQuestion(
      baseUrl,
      actorName,
      "What theme does Maya prefer now?"
    );
    assert.equal(current.answered, true);
    if (current.answered) {
      assert.match(current.answer, /light mode/i);
      assert.equal(current.coverage.ratio, 1);
      assert.equal(current.evidence[0]?.claim.evidence.content, "I now use light mode because of accessibility.");
    }

    const previous = await postQuestion(
      baseUrl,
      actorName,
      "What theme did Maya prefer previously?"
    );
    assert.equal(previous.answered, true);
    if (previous.answered) {
      assert.match(previous.answer, /dark mode/i);
      assert.equal(previous.temporalMode, "previous");
    }

    const multiPart = await postQuestion(
      baseUrl,
      actorName,
      "Where does Maya live and what is she building?"
    );
    assert.equal(multiPart.answered, true);
    if (multiPart.answered) {
      assert.match(multiPart.answer, /Bengaluru/);
      assert.match(multiPart.answer, /RecallTrace/);
      assert.equal(multiPart.coverage.ratio, 1);
      assert.equal(multiPart.evidence.length, 2);
    }

    const historical = await postQuestion(
      baseUrl,
      actorName,
      "What theme did Maya prefer as of 2026-08-15?"
    );
    assert.equal(historical.answered, true);
    if (historical.answered) {
      assert.match(historical.answer, /dark mode/i);
      assert.equal(historical.temporalMode, "as_of");
    }

    const profile = await postQuestion(
      baseUrl,
      actorName,
      "What do you remember about me?"
    );
    assert.equal(profile.answered, true);
    if (profile.answered) {
      assert.equal(profile.coverage.answered.length, 5);
      assert.deepEqual(profile.coverage.missing, ["goal"]);
      assert.equal(profile.coverage.ratio, 5 / 6);
      assert.match(profile.answer, /No supporting evidence was found for goal/i);
    }

    const abstained = await postQuestion(
      baseUrl,
      actorName,
      "What is Maya's favourite food?"
    );
    assert.equal(abstained.answered, false);
    if (!abstained.answered) {
      assert.equal(abstained.reason, "NO_SUPPORTING_EVIDENCE");
      assert.match(abstained.message, /no supported memory slot or evidence/i);
    }
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

async function postQuestion(
  baseUrl: string,
  actorName: string,
  question: string
): Promise<AskMemoryResponse> {
  const response = await fetch(`${baseUrl}/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actorName, question })
  });
  assert.equal(response.status, 200, await readFailure(response));
  return (await response.json()) as AskMemoryResponse;
}
