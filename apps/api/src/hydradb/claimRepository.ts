import type { Record as Neo4jRecord } from "neo4j-driver";
import type { HydraConnection } from "./hydraConnection.js";

const milestoneOneIds = {
  actor: 1_001,
  oldClaim: 2_001,
  currentClaim: 2_002,
  oldEvidence: 3_001,
  currentEvidence: 3_002
} as const;

const removeFixtureQuery = `
UNWIND $nodes AS row
MATCH (node {id: row.id})
DETACH DELETE node
`;

const upsertActorsQuery = `
UNWIND $rows AS row
MERGE (node {id: row.vertex})
SET node:Actor, node.name = row.name
`;

const upsertClaimsQuery = `
UNWIND $rows AS row
MERGE (node {id: row.vertex})
SET
  node:Claim,
  node.predicate = row.predicate,
  node.value = row.value,
  node.status = row.status,
  node.observedAt = row.observedAt
`;

const upsertTurnsQuery = `
UNWIND $rows AS row
MERGE (node {id: row.vertex})
SET
  node:Turn,
  node.content = row.content,
  node.occurredAt = row.occurredAt
`;

const upsertHasClaimRelationshipsQuery = `
UNWIND $rows AS row
MATCH
  (source:Actor {id: row.source_vertex}),
  (destination:Claim {id: row.destination_vertex})
MERGE (source)-[relationship:HAS_CLAIM {id: row.relationship_vertex}]->(destination)
`;

const upsertSupersedesRelationshipsQuery = `
UNWIND $rows AS row
MATCH
  (source:Claim {id: row.source_vertex}),
  (destination:Claim {id: row.destination_vertex})
MERGE (source)-[relationship:SUPERSEDES {id: row.relationship_vertex}]->(destination)
`;

const upsertSupportedByRelationshipsQuery = `
UNWIND $rows AS row
MATCH
  (source:Claim {id: row.source_vertex}),
  (destination:Turn {id: row.destination_vertex})
MERGE (source)-[relationship:SUPPORTED_BY {id: row.relationship_vertex}]->(destination)
`;

const readPreferenceHistoryQuery = `
MATCH
  (actor:Actor {id: $actorId})-[:HAS_CLAIM]->(current:Claim)-[:SUPERSEDES]->(previous:Claim),
  (current)-[:SUPPORTED_BY]->(currentTurn:Turn),
  (previous)-[:SUPPORTED_BY]->(previousTurn:Turn)
RETURN
  actor.name AS actor,
  current.value AS current,
  previous.value AS previous,
  current.status AS currentStatus,
  previous.status AS previousStatus,
  currentTurn.content AS currentEvidence,
  previousTurn.content AS previousEvidence,
  current.observedAt AS changedAt
LIMIT 1
`;

export type PreferenceHistory = {
  actor: string;
  current: string;
  previous: string;
  relationship: "SUPERSEDES";
  currentStatus: "current";
  previousStatus: "superseded";
  currentEvidence: string;
  previousEvidence: string;
  changedAt: string;
};

export class ClaimRepository {
  constructor(private readonly connection: HydraConnection) {}

  async resetMilestoneOneFixture(): Promise<void> {
    await this.connection.write(removeFixtureQuery, {
      nodes: Object.values(milestoneOneIds).map((id) => ({ id }))
    });
  }

  async seedMilestoneOneFixture(): Promise<void> {
    const oldObservedAt = "2026-03-05T09:00:00.000Z";
    const currentObservedAt = "2026-08-14T11:30:00.000Z";

    await this.connection.write(upsertActorsQuery, {
      rows: [{ vertex: milestoneOneIds.actor, name: "Maya" }]
    });

    await this.connection.write(upsertClaimsQuery, {
      rows: [
        {
          vertex: milestoneOneIds.oldClaim,
          predicate: "preferred_theme",
          value: "dark mode",
          status: "superseded",
          observedAt: oldObservedAt
        },
        {
          vertex: milestoneOneIds.currentClaim,
          predicate: "preferred_theme",
          value: "light mode",
          status: "current",
          observedAt: currentObservedAt
        }
      ]
    });

    await this.connection.write(upsertTurnsQuery, {
      rows: [
        {
          vertex: milestoneOneIds.oldEvidence,
          content: "I prefer dark mode.",
          occurredAt: oldObservedAt
        },
        {
          vertex: milestoneOneIds.currentEvidence,
          content: "I now use light mode because of accessibility.",
          occurredAt: currentObservedAt
        }
      ]
    });

    await this.connection.write(upsertHasClaimRelationshipsQuery, {
      rows: [
        relationshipRow(4_001, milestoneOneIds.actor, milestoneOneIds.oldClaim),
        relationshipRow(
          4_002,
          milestoneOneIds.actor,
          milestoneOneIds.currentClaim
        )
      ]
    });

    await this.connection.write(upsertSupersedesRelationshipsQuery, {
      rows: [
        relationshipRow(
          4_003,
          milestoneOneIds.currentClaim,
          milestoneOneIds.oldClaim
        )
      ]
    });

    await this.connection.write(upsertSupportedByRelationshipsQuery, {
      rows: [
        relationshipRow(
          4_004,
          milestoneOneIds.oldClaim,
          milestoneOneIds.oldEvidence
        ),
        relationshipRow(
          4_005,
          milestoneOneIds.currentClaim,
          milestoneOneIds.currentEvidence
        )
      ]
    });
  }

  async getMayaPreferenceHistory(): Promise<PreferenceHistory | null> {
    const result = await this.connection.read(readPreferenceHistoryQuery, {
      actorId: milestoneOneIds.actor
    });

    const record = result.records[0];
    return record ? mapPreferenceHistory(record) : null;
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

function mapPreferenceHistory(record: Neo4jRecord): PreferenceHistory {
  return {
    actor: requiredString(record, "actor"),
    current: requiredString(record, "current"),
    previous: requiredString(record, "previous"),
    relationship: "SUPERSEDES",
    currentStatus: requiredLiteral(record, "currentStatus", "current"),
    previousStatus: requiredLiteral(
      record,
      "previousStatus",
      "superseded"
    ),
    currentEvidence: requiredString(record, "currentEvidence"),
    previousEvidence: requiredString(record, "previousEvidence"),
    changedAt: requiredString(record, "changedAt")
  };
}

function requiredString(record: Neo4jRecord, key: string): string {
  const value: unknown = record.get(key);

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`HydraDB returned an invalid ${key} value`);
  }

  return value;
}

function requiredLiteral<T extends string>(
  record: Neo4jRecord,
  key: string,
  expected: T
): T {
  const value = requiredString(record, key);

  if (value !== expected) {
    throw new Error(`Expected ${key} to be ${expected}, received ${value}`);
  }

  return expected;
}
