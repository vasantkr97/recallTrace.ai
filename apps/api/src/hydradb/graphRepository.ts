import type {
  GraphEdgeKind,
  GraphNodeKind,
  MemoryGraphEdge,
  MemoryGraphNode,
  MemoryGraphResponse
} from "@recalltrace/contracts";
import type { Record as Neo4jRecord } from "neo4j-driver";
import type { HydraConnection } from "./hydraConnection.js";

const actorQuery = `
MATCH (actor:Actor {normalizedName: $normalizedName})
RETURN actor.id AS id, actor.name AS name, actor.createdAt AS createdAt
LIMIT 1
`;

const sessionsQuery = `
MATCH (actor:Actor {normalizedName: $normalizedName})-[:HAS_SESSION]->(session:Session)
RETURN
  actor.id AS actorId,
  session.id AS sessionId,
  session.externalId AS externalId,
  session.ingestedAt AS ingestedAt,
  session.messageCount AS messageCount
`;

const turnsQuery = `
MATCH
  (actor:Actor {normalizedName: $normalizedName})-[:HAS_SESSION]->(session:Session),
  (session)-[:HAS_TURN]->(turn:Turn)
RETURN
  session.id AS sessionId,
  turn.id AS turnId,
  turn.role AS role,
  turn.content AS content,
  turn.occurredAt AS occurredAt,
  turn.position AS position
`;

const claimsQuery = `
MATCH (actor:Actor {normalizedName: $normalizedName})-[:HAS_CLAIM]->(claim:Claim)
RETURN
  actor.id AS actorId,
  claim.id AS claimId,
  claim.predicate AS predicate,
  claim.displayLabel AS displayLabel,
  claim.value AS value,
  claim.status AS status,
  claim.observedAt AS observedAt,
  claim.extractor AS extractor
`;

const evidenceQuery = `
MATCH
  (actor:Actor {normalizedName: $normalizedName})-[:HAS_CLAIM]->(claim:Claim),
  (claim)-[:SUPPORTED_BY]->(turn:Turn)
RETURN claim.id AS claimId, turn.id AS turnId
`;

const temporalEdgeKinds = [
  "SUPERSEDES",
  "CONTRADICTS",
  "SUPPORTS",
  "DUPLICATES"
] as const satisfies readonly GraphEdgeKind[];

export class GraphRepository {
  constructor(private readonly connection: HydraConnection) {}

  async readActorGraph(
    normalizedActorName: string
  ): Promise<MemoryGraphResponse | null> {
    const parameters = { normalizedName: normalizedActorName };
    const actorResult = await this.connection.read(actorQuery, parameters);
    const actorRecord = actorResult.records[0];

    if (!actorRecord) {
      return null;
    }

    const [sessionResult, turnResult, claimResult, evidenceResult] =
      await Promise.all([
        this.connection.read(sessionsQuery, parameters),
        this.connection.read(turnsQuery, parameters),
        this.connection.read(claimsQuery, parameters),
        this.connection.read(evidenceQuery, parameters)
      ]);

    const actorId = requiredNumber(actorRecord, "id");
    const actorNode = node({
      id: graphNodeId("Actor", actorId),
      kind: "Actor",
      label: requiredString(actorRecord, "name"),
      occurredAt: optionalString(actorRecord, "createdAt"),
      status: null,
      properties: {
        name: requiredString(actorRecord, "name"),
        normalizedName: normalizedActorName
      }
    });

    const sessionNodes = sessionResult.records.map((record) =>
      node({
        id: graphNodeId("Session", requiredNumber(record, "sessionId")),
        kind: "Session",
        label: `Session ${shortId(requiredString(record, "externalId"))}`,
        occurredAt: requiredString(record, "ingestedAt"),
        status: null,
        properties: {
          externalId: requiredString(record, "externalId"),
          messageCount: requiredNumber(record, "messageCount")
        }
      })
    );

    const turnNodes = turnResult.records.map((record) => {
      const content = requiredString(record, "content");
      return node({
        id: graphNodeId("Turn", requiredNumber(record, "turnId")),
        kind: "Turn",
        label: excerpt(content, 42),
        occurredAt: requiredString(record, "occurredAt"),
        status: null,
        properties: {
          role: requiredString(record, "role"),
          content,
          position: requiredNumber(record, "position")
        }
      });
    });

    const claimNodes = claimResult.records.map((record) =>
      node({
        id: graphNodeId("Claim", requiredNumber(record, "claimId")),
        kind: "Claim",
        label: `${requiredString(record, "displayLabel")}: ${requiredString(record, "value")}`,
        occurredAt: requiredString(record, "observedAt"),
        status: parseClaimStatus(requiredString(record, "status")),
        properties: {
          predicate: requiredString(record, "predicate"),
          value: requiredString(record, "value"),
          extractor: requiredString(record, "extractor")
        }
      })
    );

    const structuralEdges: MemoryGraphEdge[] = [
      ...sessionResult.records.map((record) =>
        edge(
          "HAS_SESSION",
          graphNodeId("Actor", requiredNumber(record, "actorId")),
          graphNodeId("Session", requiredNumber(record, "sessionId"))
        )
      ),
      ...turnResult.records.map((record) =>
        edge(
          "HAS_TURN",
          graphNodeId("Session", requiredNumber(record, "sessionId")),
          graphNodeId("Turn", requiredNumber(record, "turnId")),
          { position: requiredNumber(record, "position") }
        )
      ),
      ...claimResult.records.map((record) =>
        edge(
          "HAS_CLAIM",
          graphNodeId("Actor", requiredNumber(record, "actorId")),
          graphNodeId("Claim", requiredNumber(record, "claimId"))
        )
      ),
      ...evidenceResult.records.map((record) =>
        edge(
          "SUPPORTED_BY",
          graphNodeId("Claim", requiredNumber(record, "claimId")),
          graphNodeId("Turn", requiredNumber(record, "turnId"))
        )
      )
    ];

    const temporalEdges = (
      await Promise.all(
        temporalEdgeKinds.map(async (kind) => {
          const result = await this.connection.read(
            temporalRelationshipQuery(kind),
            parameters
          );
          return result.records.map((record) =>
            edge(
              kind,
              graphNodeId("Claim", requiredNumber(record, "sourceId")),
              graphNodeId("Claim", requiredNumber(record, "targetId"))
            )
          );
        })
      )
    ).flat();

    const nodes = [actorNode, ...sessionNodes, ...turnNodes, ...claimNodes];
    const edges = [...structuralEdges, ...temporalEdges];
    const temporalNodes = claimNodes.length > 0 ? claimNodes : turnNodes;
    const events = [...new Set(temporalNodes.flatMap((item) => item.occurredAt ?? []))]
      .sort((left, right) => Date.parse(left) - Date.parse(right));

    return {
      actor: actorNode.label,
      nodes,
      edges,
      timeline: {
        start: events[0] ?? null,
        end: events.at(-1) ?? null,
        events
      },
      stats: {
        actors: 1,
        sessions: sessionNodes.length,
        turns: turnNodes.length,
        claims: claimNodes.length,
        relationships: edges.length,
        conflicts: temporalEdges.filter((item) => item.kind === "CONTRADICTS").length
      }
    };
  }
}

function temporalRelationshipQuery(kind: (typeof temporalEdgeKinds)[number]): string {
  return `
MATCH
  (actor:Actor {normalizedName: $normalizedName})-[:HAS_CLAIM]->(source:Claim),
  (source)-[:${kind}]->(target:Claim)
RETURN source.id AS sourceId, target.id AS targetId
`;
}

function graphNodeId(kind: GraphNodeKind, id: number): string {
  return `${kind.toLocaleLowerCase()}:${id}`;
}

function node(value: MemoryGraphNode): MemoryGraphNode {
  return value;
}

function edge(
  kind: GraphEdgeKind,
  source: string,
  target: string,
  properties: Record<string, string | number> = {}
): MemoryGraphEdge {
  return {
    id: `${kind.toLocaleLowerCase()}:${source}:${target}`,
    source,
    target,
    kind,
    properties
  };
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function excerpt(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function parseClaimStatus(value: string): MemoryGraphNode["status"] {
  if (
    value === "current" ||
    value === "superseded" ||
    value === "contested" ||
    value === "supporting" ||
    value === "duplicate"
  ) {
    return value;
  }

  throw new Error("HydraDB returned an invalid claim status");
}

function optionalString(record: Neo4jRecord, key: string): string | null {
  const value: unknown = record.get(key);
  return typeof value === "string" && value.length > 0 ? value : null;
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
