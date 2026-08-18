import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type {
  GraphNodeKind,
  MemoryGraphEdge,
  MemoryGraphNode,
  MemoryGraphResponse
} from "@recalltrace/contracts";
import { getMemoryGraph } from "../api";

type GraphExplorerProps = {
  actorName: string;
  refreshKey: number;
  highlightedNodeIds: string[];
};

type PositionedNode = MemoryGraphNode & { x: number; y: number };

const columnX: Record<GraphNodeKind, number> = {
  Actor: 90,
  Session: 300,
  Turn: 535,
  Claim: 805
};

const queryStages = [
  "Question",
  "Actor seed",
  "Claim traversal",
  "Temporal filter",
  "Evidence",
  "Answer"
];

export function GraphExplorer({
  actorName,
  refreshKey,
  highlightedNodeIds
}: GraphExplorerProps) {
  const [graph, setGraph] = useState<MemoryGraphResponse | null>(null);
  const [selectedNode, setSelectedNode] = useState<MemoryGraphNode | null>(null);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!actorName.trim()) {
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    void getMemoryGraph(actorName)
      .then((response) => {
        if (!active) return;
        setGraph(response);
        setTimelineIndex(Math.max(0, response.timeline.events.length - 1));
        setSelectedNode(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setGraph(null);
        setError(caught instanceof Error ? caught.message : "The graph could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [actorName, refreshKey]);

  const cutoff = graph?.timeline.events[timelineIndex] ?? null;
  const visibleGraph = useMemo(
    () => selectVisibleGraph(graph, cutoff),
    [graph, cutoff]
  );
  const positioned = useMemo(
    () => positionNodes(visibleGraph.nodes),
    [visibleGraph.nodes]
  );
  const positionById = useMemo(
    () => new Map(positioned.nodes.map((node) => [node.id, node])),
    [positioned.nodes]
  );
  const highlights = useMemo(
    () => new Set(highlightedNodeIds),
    [highlightedNodeIds]
  );

  return (
    <section className="graph-card" aria-label="Interactive HydraDB memory graph">
      <div className="graph-heading">
        <div>
          <p className="eyebrow">03 · Live memory graph</p>
          <h2>See why the answer is true.</h2>
          <p>Real Actor, Session, Turn, and Claim records read directly from HydraDB.</p>
        </div>
        <div className="graph-legend" aria-label="Claim status legend">
          <span className="legend-current">Current</span>
          <span className="legend-superseded">Superseded</span>
          <span className="legend-conflict">Conflict</span>
          <span className="legend-support">Support</span>
        </div>
      </div>

      <div className={`query-path ${highlights.size > 0 ? "query-path-active" : ""}`}>
        {queryStages.map((stage, index) => (
          <div key={stage} style={{ "--stage": index } as CSSProperties}>
            <span>{index + 1}</span>{stage}
          </div>
        ))}
      </div>

      {graph && (
        <div className="graph-metrics" aria-label="Graph statistics">
          <div><strong>{visibleGraph.nodes.length}</strong><span>visible nodes</span></div>
          <div><strong>{visibleGraph.edges.length}</strong><span>visible edges</span></div>
          <div><strong>{graph.stats.claims}</strong><span>claims</span></div>
          <div><strong>{graph.stats.conflicts}</strong><span>conflicts</span></div>
        </div>
      )}

      {graph && graph.timeline.events.length > 0 && (
        <div className="time-travel">
          <div>
            <span>Time travel</span>
            <strong>{cutoff ? formatDate(cutoff) : "Latest"}</strong>
          </div>
          <input
            aria-label="Memory graph point in time"
            type="range"
            min={0}
            max={Math.max(0, graph.timeline.events.length - 1)}
            value={timelineIndex}
            onChange={(event) => {
              setTimelineIndex(Number(event.target.value));
              setSelectedNode(null);
            }}
          />
          <button onClick={() => setTimelineIndex(graph.timeline.events.length - 1)}>
            Jump to now
          </button>
        </div>
      )}

      <div className="graph-stage">
        <div className="graph-canvas" aria-busy={loading}>
          {loading && <div className="graph-message">Reading HydraDB graph…</div>}
          {!loading && error && <div className="graph-message">{error} Store a memory or run the demo to begin.</div>}
          {!loading && graph && (
            <svg
              viewBox={`0 0 930 ${positioned.height}`}
              role="img"
              aria-label={`${graph.actor} memory graph with ${visibleGraph.nodes.length} visible nodes`}
            >
              <g className="graph-edges">
                {visibleGraph.edges.map((edge) => {
                  const source = positionById.get(edge.source);
                  const target = positionById.get(edge.target);
                  if (!source || !target) return null;
                  const highlighted = highlights.has(edge.source) && highlights.has(edge.target);
                  return (
                    <g key={edge.id} className={`edge-${edge.kind.toLocaleLowerCase()} ${highlighted ? "edge-highlighted" : ""}`}>
                      <path d={edgePath(source, target, edge)} />
                      {isTemporalEdge(edge) && (
                        <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 7}>
                          {edge.kind}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
              <g className="graph-nodes">
                {positioned.nodes.map((node) => {
                  const effective = visibleGraph.effectiveClaimIds.has(node.id);
                  const highlighted = highlights.has(node.id);
                  return (
                    <g
                      key={node.id}
                      className={`graph-node node-${node.kind.toLocaleLowerCase()} ${node.status ? `node-${node.status}` : ""} ${effective ? "node-effective" : ""} ${highlighted ? "node-highlighted" : ""}`}
                      transform={`translate(${node.x} ${node.y})`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Inspect ${node.kind}: ${node.label}`}
                      onClick={() => setSelectedNode(node)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") setSelectedNode(node);
                      }}
                    >
                      <circle r={node.kind === "Actor" ? 30 : 22} />
                      <text className="node-kind" y={node.kind === "Actor" ? -41 : -33}>{node.kind}</text>
                      <text className="node-label" y={node.kind === "Actor" ? 49 : 40}>{truncate(node.label, 26)}</text>
                      {effective && <text className="effective-label" y={4}>✓</text>}
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
        </div>

        <aside className="node-inspector" aria-live="polite">
          {selectedNode ? (
            <>
              <span>{selectedNode.kind} properties</span>
              <h3>{selectedNode.label}</h3>
              {selectedNode.status && <code className={`inspector-${selectedNode.status}`}>{selectedNode.status}</code>}
              <dl>
                {Object.entries(selectedNode.properties).map(([key, value]) => (
                  <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
                ))}
                {selectedNode.occurredAt && (
                  <div><dt>observed at</dt><dd>{formatDate(selectedNode.occurredAt)}</dd></div>
                )}
              </dl>
              <small>{selectedNode.id}</small>
            </>
          ) : (
            <div className="inspector-empty">
              <span>Node inspector</span>
              <h3>Select any node.</h3>
              <p>Inspect normalized values, source turns, timestamps, status, and graph identity.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function selectVisibleGraph(graph: MemoryGraphResponse | null, cutoff: string | null) {
  if (!graph) {
    return { nodes: [], edges: [], effectiveClaimIds: new Set<string>() };
  }

  const cutoffTime = cutoff ? Date.parse(cutoff) : Number.POSITIVE_INFINITY;
  const initiallyVisible = new Set(
    graph.nodes
      .filter((node) => node.kind === "Actor" || !node.occurredAt || Date.parse(node.occurredAt) <= cutoffTime)
      .map((node) => node.id)
  );

  for (const edge of graph.edges) {
    if (edge.kind === "HAS_TURN" && initiallyVisible.has(edge.target)) {
      initiallyVisible.add(edge.source);
    }
  }

  const nodes = graph.nodes.filter((node) => initiallyVisible.has(node.id));
  const edges = graph.edges.filter(
    (edge) => initiallyVisible.has(edge.source) && initiallyVisible.has(edge.target)
  );
  const effectiveClaimIds = findEffectiveClaims(nodes);
  return { nodes, edges, effectiveClaimIds };
}

function findEffectiveClaims(nodes: MemoryGraphNode[]): Set<string> {
  const newestByPredicate = new Map<string, MemoryGraphNode>();

  for (const node of nodes) {
    if (node.kind !== "Claim" || !["current", "superseded"].includes(node.status ?? "")) continue;
    const predicate = String(node.properties.predicate);
    const existing = newestByPredicate.get(predicate);
    if (!existing || Date.parse(node.occurredAt ?? "") > Date.parse(existing.occurredAt ?? "")) {
      newestByPredicate.set(predicate, node);
    }
  }

  return new Set([...newestByPredicate.values()].map((node) => node.id));
}

function positionNodes(nodes: MemoryGraphNode[]) {
  const groups = new Map<GraphNodeKind, MemoryGraphNode[]>([
    ["Actor", []], ["Session", []], ["Turn", []], ["Claim", []]
  ]);
  for (const node of nodes) groups.get(node.kind)?.push(node);
  for (const group of groups.values()) {
    group.sort((left, right) => Date.parse(left.occurredAt ?? "") - Date.parse(right.occurredAt ?? ""));
  }
  const largest = Math.max(1, ...[...groups.values()].map((group) => group.length));
  const height = Math.max(480, largest * 92 + 90);
  const positioned: PositionedNode[] = [];

  for (const [kind, group] of groups) {
    const gap = height / (group.length + 1);
    group.forEach((node, index) => positioned.push({ ...node, x: columnX[kind], y: gap * (index + 1) }));
  }

  return { nodes: positioned, height };
}

function edgePath(source: PositionedNode, target: PositionedNode, edge: MemoryGraphEdge): string {
  if (isTemporalEdge(edge)) {
    const bend = Math.max(35, Math.abs(source.y - target.y) * 0.45);
    return `M ${source.x} ${source.y} C ${source.x + bend} ${source.y}, ${target.x + bend} ${target.y}, ${target.x} ${target.y}`;
  }
  const middle = (source.x + target.x) / 2;
  return `M ${source.x} ${source.y} C ${middle} ${source.y}, ${middle} ${target.y}, ${target.x} ${target.y}`;
}

function isTemporalEdge(edge: MemoryGraphEdge): boolean {
  return ["SUPERSEDES", "CONTRADICTS", "SUPPORTS", "DUPLICATES"].includes(edge.kind);
}

function truncate(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
