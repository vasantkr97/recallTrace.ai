import { randomBytes, randomUUID } from "node:crypto";
import type {
  ClaimView,
  ConversationMessageInput,
  RecallResult
} from "@recalltrace/contracts";
import type { Record as Neo4jRecord } from "neo4j-driver";
import type { ExtractedClaim } from "../memory/claimExtractor.js";
import type { HydraConnection } from "./hydraConnection.js";

type StoreSessionInput = {
  actorName: string;
  normalizedActorName: string;
  sessionId: string;
  ingestedAt: string;
  messages: ConversationMessageInput[];
  claim: ExtractedClaim;
};

type CurrentClaimIdentity = {
  id: number;
};

const findActorQuery = `
MATCH (actor:Actor {normalizedName: $normalizedName})
RETURN actor.id AS actorId
LIMIT 1
`;

const createActorQuery = `
UNWIND $rows AS row
MERGE (actor {id: row.id})
SET
  actor:Actor,
  actor.name = row.name,
  actor.normalizedName = row.normalizedName,
  actor.createdAt = row.createdAt
`;

const createSessionQuery = `
UNWIND $rows AS row
MERGE (session {id: row.id})
SET
  session:Session,
  session.externalId = row.externalId,
  session.ingestedAt = row.ingestedAt,
  session.messageCount = row.messageCount
`;

const createTurnsQuery = `
UNWIND $rows AS row
MERGE (turn {id: row.vertex})
SET
  turn:Turn,
  turn.externalId = row.externalId,
  turn.role = row.role,
  turn.content = row.content,
  turn.occurredAt = row.occurredAt,
  turn.position = row.position
`;

const createClaimQuery = `
UNWIND $rows AS row
MERGE (claim {id: row.id})
SET
  claim:Claim,
  claim.externalId = row.externalId,
  claim.predicate = row.predicate,
  claim.displayLabel = row.displayLabel,
  claim.value = row.value,
  claim.status = row.status,
  claim.observedAt = row.observedAt,
  claim.extractor = row.extractor
`;

const createActorSessionRelationshipQuery = `
UNWIND $rows AS row
MATCH (actor:Actor {id: row.source_vertex}), (session:Session {id: row.destination_vertex})
MERGE (actor)-[relationship:HAS_SESSION {id: row.relationship_vertex}]->(session)
`;

const createSessionTurnRelationshipsQuery = `
UNWIND $rows AS row
MATCH (session:Session {id: row.source_vertex}), (turn:Turn {id: row.destination_vertex})
MERGE (session)-[relationship:HAS_TURN {id: row.relationship_vertex}]->(turn)
SET relationship.position = row.position
`;

const createActorClaimRelationshipQuery = `
UNWIND $rows AS row
MATCH (actor:Actor {id: row.source_vertex}), (claim:Claim {id: row.destination_vertex})
MERGE (actor)-[relationship:HAS_CLAIM {id: row.relationship_vertex}]->(claim)
`;

const createEvidenceRelationshipQuery = `
UNWIND $rows AS row
MATCH (claim:Claim {id: row.source_vertex}), (turn:Turn {id: row.destination_vertex})
MERGE (claim)-[relationship:SUPPORTED_BY {id: row.relationship_vertex}]->(turn)
`;

const findCurrentClaimQuery = `
MATCH (actor:Actor {id: $actorId})-[:HAS_CLAIM]->(claim:Claim {predicate: $predicate, status: $status})
RETURN claim.id AS claimId
LIMIT 1
`;

const createSupersedesRelationshipQuery = `
UNWIND $rows AS row
MATCH (current:Claim {id: row.source_vertex}), (previous:Claim {id: row.destination_vertex})
MERGE (current)-[relationship:SUPERSEDES {id: row.relationship_vertex}]->(previous)
`;

const markClaimSupersededQuery = `
UNWIND $rows AS row
MERGE (claim {id: row.claimId})
SET claim:Claim, claim.status = row.status
`;

const readCurrentClaimQuery = `
MATCH
  (actor:Actor {normalizedName: $normalizedName})-[:HAS_CLAIM]->(claim:Claim {predicate: $predicate, status: $status}),
  (claim)-[:SUPPORTED_BY]->(turn:Turn),
  (session:Session)-[:HAS_TURN]->(turn)
RETURN
  actor.name AS actor,
  claim.id AS claimId,
  claim.predicate AS predicate,
  claim.displayLabel AS displayLabel,
  claim.value AS value,
  claim.status AS status,
  claim.observedAt AS observedAt,
  turn.content AS evidenceContent,
  turn.occurredAt AS evidenceOccurredAt,
  session.externalId AS sessionId
LIMIT 1
`;

const readPreviousClaimQuery = `
MATCH
  (current:Claim {id: $currentClaimId})-[:SUPERSEDES]->(previous:Claim),
  (previous)-[:SUPPORTED_BY]->(turn:Turn),
  (session:Session)-[:HAS_TURN]->(turn)
RETURN
  previous.predicate AS predicate,
  previous.displayLabel AS displayLabel,
  previous.value AS value,
  previous.status AS status,
  previous.observedAt AS observedAt,
  turn.content AS evidenceContent,
  turn.occurredAt AS evidenceOccurredAt,
  session.externalId AS sessionId
LIMIT 1
`;

export class MemoryRepository {
  constructor(private readonly connection: HydraConnection) {}

  async storeSession(input: StoreSessionInput): Promise<void> {
    const actorId = await this.findOrCreateActor(input);
    const previousClaim = await this.findCurrentClaim(
      actorId,
      input.claim.predicate
    );
    const sessionVertex = graphId();
    const claimVertex = graphId();
    const claimExternalId = randomUUID();
    const turns = input.messages.map((message, position) => ({
      vertex: graphId(),
      externalId: randomUUID(),
      role: message.role,
      content: message.content,
      occurredAt: message.occurredAt ?? input.ingestedAt,
      position
    }));
    const evidenceTurn = turns[input.claim.sourceMessageIndex];

    if (!evidenceTurn) {
      throw new Error("The extracted claim references a missing source turn");
    }

    await this.connection.write(createSessionQuery, {
      rows: [{
        id: sessionVertex,
        externalId: input.sessionId,
        ingestedAt: input.ingestedAt,
        messageCount: turns.length
      }]
    });
    await this.connection.write(createTurnsQuery, { rows: turns });
    await this.connection.write(createClaimQuery, {
      rows: [{
        id: claimVertex,
        externalId: claimExternalId,
        predicate: input.claim.predicate,
        displayLabel: input.claim.label,
        value: input.claim.value,
        status: "current",
        observedAt: input.claim.observedAt,
        extractor: "deterministic-theme-v1"
      }]
    });
    await this.connection.write(createActorSessionRelationshipQuery, {
      rows: [{
        relationship_vertex: graphId(),
        source_vertex: actorId,
        destination_vertex: sessionVertex
      }]
    });
    await this.connection.write(createSessionTurnRelationshipsQuery, {
      rows: turns.map((turn) => ({
        relationship_vertex: graphId(),
        source_vertex: sessionVertex,
        destination_vertex: turn.vertex,
        position: turn.position
      }))
    });
    await this.connection.write(createActorClaimRelationshipQuery, {
      rows: [{
        relationship_vertex: graphId(),
        source_vertex: actorId,
        destination_vertex: claimVertex
      }]
    });
    await this.connection.write(createEvidenceRelationshipQuery, {
      rows: [{
        relationship_vertex: graphId(),
        source_vertex: claimVertex,
        destination_vertex: evidenceTurn.vertex
      }]
    });

    if (previousClaim) {
      await this.connection.write(createSupersedesRelationshipQuery, {
        rows: [{
          relationship_vertex: graphId(),
          source_vertex: claimVertex,
          destination_vertex: previousClaim.id
        }]
      });
      await this.connection.write(markClaimSupersededQuery, {
        rows: [{ claimId: previousClaim.id, status: "superseded" }]
      });
    }
  }

  async recall(
    normalizedActorName: string,
    predicate: string
  ): Promise<RecallResult | null> {
    const currentResult = await this.connection.read(readCurrentClaimQuery, {
      normalizedName: normalizedActorName,
      predicate,
      status: "current"
    });
    const currentRecord = currentResult.records[0];

    if (!currentRecord) {
      return null;
    }

    const currentClaimId = requiredNumber(currentRecord, "claimId");
    const previousResult = await this.connection.read(readPreviousClaimQuery, {
      currentClaimId
    });
    const previousRecord = previousResult.records[0];
    const actor = requiredString(currentRecord, "actor");
    const current = mapClaim(currentRecord);

    return {
      found: true,
      actor,
      predicate: current.predicate,
      current,
      previous: previousRecord ? mapClaim(previousRecord) : null,
      path: [
        `Actor(${actor})`,
        "HAS_CLAIM",
        `Claim(${current.predicate}=${current.value})`,
        "SUPPORTED_BY",
        "Turn"
      ]
    };
  }

  private async findOrCreateActor(input: StoreSessionInput): Promise<number> {
    const result = await this.connection.read(findActorQuery, {
      normalizedName: input.normalizedActorName
    });
    const existing = result.records[0];

    if (existing) {
      return requiredNumber(existing, "actorId");
    }

    const actorId = graphId();
    await this.connection.write(createActorQuery, {
      rows: [{
        id: actorId,
        name: input.actorName,
        normalizedName: input.normalizedActorName,
        createdAt: input.ingestedAt
      }]
    });
    return actorId;
  }

  private async findCurrentClaim(
    actorId: number,
    predicate: string
  ): Promise<CurrentClaimIdentity | null> {
    const result = await this.connection.read(findCurrentClaimQuery, {
      actorId,
      predicate,
      status: "current"
    });
    const record = result.records[0];

    if (!record) {
      return null;
    }

    return {
      id: requiredNumber(record, "claimId")
    };
  }
}

function graphId(): number {
  return randomBytes(6).readUIntBE(0, 6);
}

function mapClaim(record: Neo4jRecord): ClaimView {
  const status = requiredString(record, "status");

  if (status !== "current" && status !== "superseded") {
    throw new Error(`HydraDB returned an invalid claim status: ${status}`);
  }

  return {
    predicate: requiredString(record, "predicate"),
    label: requiredString(record, "displayLabel"),
    value: requiredString(record, "value"),
    status,
    observedAt: requiredString(record, "observedAt"),
    evidence: {
      content: requiredString(record, "evidenceContent"),
      occurredAt: requiredString(record, "evidenceOccurredAt"),
      sessionId: requiredString(record, "sessionId")
    }
  };
}

function requiredString(record: Neo4jRecord, key: string): string {
  const value: unknown = record.get(key);

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`HydraDB returned an invalid ${key} value`);
  }

  return value;
}

function requiredNumber(record: Neo4jRecord, key: string): number {
  const value: unknown = record.get(key);

  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`HydraDB returned an invalid ${key} value`);
  }

  return value;
}
