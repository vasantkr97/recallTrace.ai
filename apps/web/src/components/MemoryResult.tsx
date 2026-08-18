import type { ClaimView, RecallResult } from "@recalltrace/contracts";

type MemoryResultProps = {
  result: RecallResult | null;
};

export function MemoryResult({ result }: MemoryResultProps) {
  if (!result) {
    return (
      <section className="result-card result-empty" aria-live="polite">
        <div className="empty-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="eyebrow">Waiting for a trace</p>
        <h2>Your recalled memory will appear here.</h2>
        <p>
          Run the temporal demo or store a fact to see current truth, history,
          conflicts, and source evidence in one view.
        </p>
      </section>
    );
  }

  return (
    <section className="result-card" aria-live="polite">
      <div className="result-heading">
        <div>
          <p className="eyebrow">
            {result.asOf ? `Memory as of ${formatTime(result.asOf)}` : "Live recall"}
            {` · ${result.actor}`}
          </p>
          <h2>Memory, with receipts.</h2>
        </div>
        <span className="verified-badge">
          <span aria-hidden="true">✓</span> {Math.round(result.confidence * 100)}% confidence
        </span>
      </div>

      <div className="trace-metrics">
        <Metric value={result.history.length} label="prior truths" />
        <Metric value={result.conflicts.length} label="conflicts" danger={result.conflicts.length > 0} />
        <Metric value={result.supportingEvidence.length} label="supporting sources" />
      </div>

      <div className="claim-stack">
        <ClaimCard claim={result.current} current />
        {result.history.length > 0 ? (
          result.history.map((claim, index) => (
            <div key={`${claim.observedAt}-${claim.value}`}>
              <div className="supersedes-link">
                <span /> {index === 0 ? "SUPERSEDES" : "PRECEDED BY"} <span />
              </div>
              <ClaimCard claim={claim} />
            </div>
          ))
        ) : (
          <div className="first-memory-note">First known value for this slot</div>
        )}
      </div>

      {result.conflicts.length > 0 && (
        <div className="signal-panel conflict-panel">
          <div className="signal-title">
            <span>Contested evidence</span>
            <strong>{result.conflicts.length}</strong>
          </div>
          {result.conflicts.map((claim) => (
            <p key={`${claim.observedAt}-${claim.value}`}>
              <strong>{claim.value}</strong> · “{claim.evidence.content}”
            </p>
          ))}
        </div>
      )}

      {result.supportingEvidence.length > 0 && (
        <div className="signal-panel support-panel">
          <div className="signal-title">
            <span>Corroborating evidence</span>
            <strong>{result.supportingEvidence.length}</strong>
          </div>
          {result.supportingEvidence.map((evidence) => (
            <p key={`${evidence.sessionId}-${evidence.occurredAt}`}>“{evidence.content}”</p>
          ))}
        </div>
      )}

      <div className="path-panel">
        <div className="path-title">
          <span>HydraDB traversal path</span>
          <code>{result.predicate}</code>
        </div>
        <div className="path-items">
          {result.path.map((part, index) => (
            <span className={index % 2 === 0 ? "path-node" : "path-edge"} key={`${part}-${index}`}>
              {part}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Metric({ value, label, danger = false }: { value: number; label: string; danger?: boolean }) {
  return (
    <div className={danger ? "metric-danger" : ""}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ClaimCard({ claim, current = false }: { claim: ClaimView; current?: boolean }) {
  return (
    <article className={`claim-card ${current ? "claim-current" : "claim-previous"}`}>
      <div className="claim-meta">
        <span className="claim-status">
          <i aria-hidden="true" /> {current ? "Effective truth" : "Previous truth"}
        </span>
        <time dateTime={claim.observedAt}>{formatTime(claim.observedAt)}</time>
      </div>
      <p className="claim-label">{claim.label}</p>
      <h3>{claim.value}</h3>
      <blockquote>“{claim.evidence.content}”</blockquote>
      <p className="source-id">Source · session {claim.evidence.sessionId.slice(0, 8)}</p>
    </article>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
