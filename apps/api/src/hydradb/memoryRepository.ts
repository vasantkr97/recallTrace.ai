import { randomBytes, randomUUID } from "node:crypto";
import type {
  ClaimView,
  ConversationMessageInput,
  MemoryDecisionView,
  RecallResult
} from "@recalltrace/contracts";
import type { Record as Neo4jRecord } from "neo4j-driver";
import {
  canonicalPredicateSchema,
  claimStatusSchema,
  type ExtractedClaim,
  type MemoryDecision
} from "../memory/claimSchema.js";
import {
  TemporalDecisionEngine,
  type CurrentClaimSnapshot
} from "../memory/temporalDecisionEngine.js";
import type { HydraConnection } from "./hydraConnection.js";

type StoreSessionInput = {
  actorName: string;
  normalizedActorName: string;
  sessionId: string;
  ingestedAt: string;
  messages: ConversationMessageInput[];
  claims: ExtractedClaim[];
};

export type StoreSessionOutcome = {
  decisions: MemoryDecisionView[];
};

type StoredTurn = {
  vertex: number;
  externalId: string;
  role: string;
  content: string;
  occurredAt: string;
  position: number;
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
MATCH
  (actor:Actor {id: $actorId})-[:HAS_CLAIM]->(claim:Claim {predicate: $predicate, status: $status}),
  (claim)-[:SUPPORTED_BY]->(turn:Turn)
RETURN
  claim.id AS claimId,
  claim.value AS value,
  claim.observedAt AS observedAt,
  turn.content AS evidenceContent
LIMIT 1
`;

const createSupersedesRelationshipQuery = relationshipQuery("SUPERSEDES");
const createContradictsRelationshipQuery = relationshipQuery("CONTRADICTS");
const createSupportsRelationshipQuery = relationshipQuery("SUPPORTS");
const createDuplicatesRelationshipQuery = relationshipQuery("DUPLICATES");

const markClaimSupersededQuery = `
UNWIND $rows AS row
MERGE (claim {id: row.claimId})
SET claim:Claim, claim.status = row.status
`;

const readClaimsQuery = `
MATCH
  (actor:Actor {normalizedName: $normalizedName})-[:HAS_CLAIM]->(claim:Claim {predicate: $predicate}),
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
`;

export class MemoryRepository {
  constructor(
    private readonly connection: HydraConnection,
    private readonly decisionEngine: TemporalDecisionEngine
  ) {}

  async storeSession(input: StoreSessionInput): Promise<StoreSessionOutcome> {
    const actorId = await this.findOrCreateActor(input);
    const sessionVertex = graphId();
    const turns: StoredTurn[] = input.messages.map((message, position) => ({
      vertex: graphId(),
      externalId: randomUUID(),
      role: message.role,
      content: message.content,
      occurredAt: message.occurredAt ?? input.ingestedAt,
      position
    }));

    await this.storeConversationGraph(
      actorId,
      sessionVertex,
      input,
      turns
    );

    const decisions: MemoryDecisionView[] = [];

    for (const claim of input.claims) {
      const evidenceTurn = turns[claim.sourceMessageIndex];

      if (!evidenceTurn) {
        throw new Error("An extracted claim references a missing source turn");
      }

      const current = await this.findCurrentClaim(actorId, claim.predicate);
      const temporalDecision = this.decisionEngine.decide(
        claim,
        current,
        evidenceTurn.content
      );
      const claimVertex = graphId();

      await this.storeClaim(
        actorId,
        claimVertex,
        claim,
        evidenceTurn,
        temporalDecision.incomingStatus
      );

      if (current) {
        await this.linkTemporalDecision(
          temporalDecision.decision,
          claimVertex,
          current.id
        );

        if (temporalDecision.replacesCurrent) {
          await this.connection.write(markClaimSupersededQuery, {
            rows: [{ claimId: current.id, status: "superseded" }]
          });
        }
      }

      decisions.push({
        predicate: claim.predicate,
        label: claim.label,
        value: claim.value,
        decision: temporalDecision.decision,
        status: temporalDecision.incomingStatus
      });
    }

    return { decisions };
  }

  async recall(
    normalizedActorName: string,
    predicate: string,
    asOf?: string
  ): Promise<RecallResult | null> {
    const result = await this.connection.read(readClaimsQuery, {
      normalizedName: normalizedActorName,
      predicate
    });

    if (result.records.length === 0) {
      return null;
    }

    const actor = requiredString(result.records[0]!, "actor");
    const cutoff = asOf ? Date.parse(asOf) : Number.POSITIVE_INFINITY;
    const claims = result.records
      .map(mapClaim)
      .filter((claim) => Date.parse(claim.observedAt) <= cutoff)
      .sort(newestFirst);
    const truthHistory = claims.filter(
      (claim) => claim.status === "current" || claim.status === "superseded"
    );
    const effective = truthHistory[0];

    if (!effective) {
      return null;
    }

    const current: ClaimView = { ...effective, status: "current" };
    const history = truthHistory.slice(1).map(
      (claim): ClaimView => ({ ...claim, status: "superseded" })
    );
    const conflicts = claims.filter(
      (claim) =>
        claim.status === "contested" &&
        normalizeValue(claim.value) !== normalizeValue(current.value)
    );
    const supportingClaims = claims.filter(
      (claim) =>
        (claim.status === "supporting" || claim.status === "duplicate") &&
        normalizeValue(claim.value) === normalizeValue(current.value)
    );

    return {
      found: true,
      actor,
      predicate: current.predicate,
      current,
      previous: history[0] ?? null,
      history,
      conflicts,
      supportingEvidence: supportingClaims.map((claim) => claim.evidence),
      asOf: asOf ?? null,
      confidence: calculateConfidence(supportingClaims.length, conflicts.length),
      path: [
        `Actor(${actor})`,
        "HAS_CLAIM",
        `Claim(${current.predicate}=${current.value})`,
        "SUPPORTED_BY",
        "Turn"
      ]
    };
  }

  private async storeConversationGraph(
    actorId: number,
    sessionVertex: number,
    input: StoreSessionInput,
    turns: StoredTurn[]
  ): Promise<void> {
    await this.connection.write(createSessionQuery, {
      rows: [
        {
          id: sessionVertex,
          externalId: input.sessionId,
          ingestedAt: input.ingestedAt,
          messageCount: turns.length
        }
      ]
    });
    await this.connection.write(createTurnsQuery, { rows: turns });
    await this.connection.write(createActorSessionRelationshipQuery, {
      rows: [relationshipRow(graphId(), actorId, sessionVertex)]
    });
    await this.connection.write(createSessionTurnRelationshipsQuery, {
      rows: turns.map((turn) => ({
        ...relationshipRow(graphId(), sessionVertex, turn.vertex),
        position: turn.position
      }))
    });
  }

  private async storeClaim(
    actorId: number,
    claimVertex: number,
    claim: ExtractedClaim,
    evidenceTurn: StoredTurn,
    status: MemoryDecisionView["status"]
  ): Promise<void> {
    await this.connection.write(createClaimQuery, {
      rows: [
        {
          id: claimVertex,
          externalId: randomUUID(),
          predicate: claim.predicate,
          displayLabel: claim.label,
          value: claim.value,
          status,
          observedAt: claim.observedAt,
          extractor: "deterministic-structured-v2"
        }
      ]
    });
    await this.connection.write(createActorClaimRelationshipQuery, {
      rows: [relationshipRow(graphId(), actorId, claimVertex)]
    });
    await this.connection.write(createEvidenceRelationshipQuery, {
      rows: [relationshipRow(graphId(), claimVertex, evidenceTurn.vertex)]
    });
  }

  private async linkTemporalDecision(
    decision: MemoryDecision,
    incomingClaimId: number,
    currentClaimId: number
  ): Promise<void> {
    const query = temporalRelationshipQuery(decision);

    if (!query) {
      return;
    }

    await this.connection.write(query, {
      rows: [relationshipRow(graphId(), incomingClaimId, currentClaimId)]
    });
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
      rows: [
        {
          id: actorId,
          name: input.actorName,
          normalizedName: input.normalizedActorName,
          createdAt: input.ingestedAt
        }
      ]
    });
    return actorId;
  }

  private async findCurrentClaim(
    actorId: number,
    predicate: string
  ): Promise<CurrentClaimSnapshot | null> {
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
      id: requiredNumber(record, "claimId"),
      value: requiredString(record, "value"),
      observedAt: requiredString(record, "observedAt"),
      evidenceContent: requiredString(record, "evidenceContent")
    };
  }
}

function relationshipQuery(type: string): string {
  return `
UNWIND $rows AS row
MATCH (incoming:Claim {id: row.source_vertex}), (existing:Claim {id: row.destination_vertex})
MERGE (incoming)-[relationship:${type} {id: row.relationship_vertex}]->(existing)
`;
}

function temporalRelationshipQuery(decision: MemoryDecision): string | null {
  switch (decision) {
    case "SUPERSEDES":
      return createSupersedesRelationshipQuery;
    case "CONTRADICTS":
      return createContradictsRelationshipQuery;
    case "SUPPORTS":
      return createSupportsRelationshipQuery;
    case "DUPLICATES":
      return createDuplicatesRelationshipQuery;
    case "NEW":
      return null;
  }
}

function relationshipRow(
  relationshipVertex: number,
  sourceVertex: number,
  destinationVertex: number
) {
  return {
    relationship_vertex: relationshipVertex,
    source_vertex: sourceVertex,
    destination_vertex: destinationVertex
  };
}

function graphId(): number {
  return randomBytes(6).readUIntBE(0, 6);
}

function mapClaim(record: Neo4jRecord): ClaimView {
  return {
    predicate: canonicalPredicateSchema.parse(requiredString(record, "predicate")),
    label: requiredString(record, "displayLabel"),
    value: requiredString(record, "value"),
    status: claimStatusSchema.parse(requiredString(record, "status")),
    observedAt: requiredString(record, "observedAt"),
    evidence: {
      content: requiredString(record, "evidenceContent"),
      occurredAt: requiredString(record, "evidenceOccurredAt"),
      sessionId: requiredString(record, "sessionId")
    }
  };
}

function newestFirst(left: ClaimView, right: ClaimView): number {
  return Date.parse(right.observedAt) - Date.parse(left.observedAt);
}

function normalizeValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function calculateConfidence(supports: number, conflicts: number): number {
  const score = 0.88 + Math.min(supports, 3) * 0.03 - Math.min(conflicts, 3) * 0.12;
  return Number(Math.max(0.4, Math.min(0.98, score)).toFixed(2));
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
