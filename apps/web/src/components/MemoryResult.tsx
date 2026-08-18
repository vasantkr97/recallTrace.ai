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
          Run the demo or store a preference to see current truth, history, and
          source evidence in one view.
        </p>
      </section>
    );
  }

  return (
    <section className="result-card" aria-live="polite">
      <div className="result-heading">
        <div>
          <p className="eyebrow">Live recall · {result.actor}</p>
          <h2>Memory, with receipts.</h2>
        </div>
        <span className="verified-badge">
          <span aria-hidden="true">✓</span> HydraDB verified
        </span>
      </div>

      <div className="claim-stack">
        <ClaimCard claim={result.current} current />
        {result.previous ? (
          <>
            <div className="supersedes-link">
              <span /> SUPERSEDES <span />
            </div>
            <ClaimCard claim={result.previous} />
          </>
        ) : (
          <div className="first-memory-note">First known value for this slot</div>
        )}
      </div>

      <div className="path-panel">
        <div className="path-title">
          <span>Traversal path</span>
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

function ClaimCard({ claim, current = false }: { claim: ClaimView; current?: boolean }) {
  return (
    <article className={`claim-card ${current ? "claim-current" : "claim-previous"}`}>
      <div className="claim-meta">
        <span className="claim-status">
          <i aria-hidden="true" /> {current ? "Current truth" : "Previous truth"}
        </span>
        <time dateTime={claim.observedAt}>{formatTime(claim.observedAt)}</time>
      </div>
      <p className="claim-label">{claim.label}</p>
      <h3>{claim.value}</h3>
      <blockquote>“{claim.evidence.content}”</blockquote>
      <p className="source-id">
        Source · session {claim.evidence.sessionId.slice(0, 8)}
      </p>
    </article>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
