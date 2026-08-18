import { useEffect, useState } from "react";
import type {
  CanonicalPredicate,
  MemoryDecisionView,
  RecallResult
} from "@recalltrace/contracts";
import { checkHealth, ingestSession, recallMemory } from "./api";
import { MemoryResult } from "./components/MemoryResult";
import { AskPanel } from "./components/AskPanel";

type ActivityState = "idle" | "storing" | "recalling" | "demo";

const memorySlots: Array<{ value: CanonicalPredicate; label: string }> = [
  { value: "preferred_theme", label: "Preferred theme" },
  { value: "employer", label: "Employer" },
  { value: "current_city", label: "Current city" },
  { value: "destination_city", label: "Moving to" },
  { value: "active_project", label: "Active project" },
  { value: "goal", label: "Goal" }
];

export function App() {
  const [actorName, setActorName] = useState("Maya");
  const [message, setMessage] = useState("I prefer dark mode.");
  const [predicate, setPredicate] = useState<CanonicalPredicate>("preferred_theme");
  const [asOf, setAsOf] = useState("");
  const [result, setResult] = useState<RecallResult | null>(null);
  const [decisions, setDecisions] = useState<MemoryDecisionView[]>([]);
  const [activity, setActivity] = useState<ActivityState>("idle");
  const [notice, setNotice] = useState("Ready to write the first memory.");
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  const busy = activity !== "idle";

  useEffect(() => {
    void checkHealth().then(setConnected);
  }, []);

  async function remember() {
    setActivity("storing");
    setError(null);
    setNotice("Extracting canonical claims and classifying graph relationships…");

    try {
      const response = await ingestSession({
        actorName,
        messages: [{ role: "user", content: message }]
      });
      setPredicate(response.extractedClaim.predicate);
      setAsOf("");
      setDecisions(response.extractedClaims);
      setResult(response.recall);
      setNotice(
        `Stored ${response.extractedClaims.length} claim${response.extractedClaims.length === 1 ? "" : "s"} from ${response.storedTurns} turn.`
      );
    } catch (caught) {
      showError(caught);
    } finally {
      setActivity("idle");
    }
  }

  async function recall() {
    setActivity("recalling");
    setError(null);
    setNotice("Traversing the temporal graph and ranking evidence…");

    try {
      const recalled = await recallMemory(
        actorName,
        predicate,
        asOf ? new Date(asOf).toISOString() : undefined
      );
      setResult(recalled);
      setDecisions([]);
      setNotice(
        recalled.asOf
          ? "Historical truth reconstructed from immutable claims."
          : "Current truth and its full evidence trail were retrieved from HydraDB."
      );
    } catch (caught) {
      showError(caught);
    } finally {
      setActivity("idle");
    }
  }

  async function runDemo() {
    setActivity("demo");
    setError(null);
    setAsOf("");
    const now = Date.now();

    try {
      setNotice("Demo 1/3 · storing profile facts and the original preference…");
      const profile = await ingestSession({
        actorName,
        messages: [
          {
            role: "user",
            content: "I work at Acme and I prefer dark mode.",
            occurredAt: new Date(now - 172_800_000).toISOString()
          }
        ]
      });

      setNotice("Demo 2/3 · linking project and location context…");
      const context = await ingestSession({
        actorName,
        messages: [
          {
            role: "user",
            content: "I am building RecallTrace and I live in Bengaluru.",
            occurredAt: new Date(now - 86_400_000).toISOString()
          }
        ]
      });

      setNotice("Demo 3/3 · preserving the preference update…");
      const updated = await ingestSession({
        actorName,
        messages: [
          {
            role: "user",
            content: "I now use light mode because of accessibility.",
            occurredAt: new Date(now).toISOString()
          }
        ]
      });

      setMessage("I now use light mode because of accessibility.");
      setPredicate("preferred_theme");
      setDecisions([
        ...profile.extractedClaims,
        ...context.extractedClaims,
        ...updated.extractedClaims
      ]);
      setResult(updated.recall);
      setNotice("Temporal demo complete · every fact, update, and source is traceable.");
    } catch (caught) {
      showError(caught);
    } finally {
      setActivity("idle");
    }
  }

  function showError(caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Something went wrong.";
    setError(message);
    setNotice("The request did not complete. Check the API and try again.");
  }

  return (
    <main>
      <nav className="topbar" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="RecallTrace home">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>RecallTrace<em>.ai</em></span>
        </a>
        <div className="nav-status">
          <span className={`status-dot ${connected === false ? "status-offline" : ""}`} />
          {connected === null ? "Checking HydraDB" : connected ? "HydraDB connected" : "HydraDB unavailable"}
        </div>
      </nav>

      <header className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Temporal memory for AI agents</p>
          <h1>Memory should evolve.<br /><span>Not disappear.</span></h1>
          <p className="hero-description">
            RecallTrace remembers what changed, when it changed, and the exact
            conversation that proves it.
          </p>
        </div>
        <div className="hero-proof" aria-label="RecallTrace principles">
          <div><strong>Temporal</strong><span>Ask what was true before</span></div>
          <div><strong>Explainable</strong><span>Every answer has evidence</span></div>
          <div><strong>Graph-native</strong><span>Conflicts stay visible</span></div>
        </div>
      </header>

      <AskPanel actorName={actorName} />

      <section className="workspace" aria-label="RecallTrace memory workspace">
        <div className="composer-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">01 · Ingest and recall</p>
              <h2>Build an evolving memory.</h2>
            </div>
            <button className="demo-button" onClick={runDemo} disabled={busy}>
              <span aria-hidden="true">▶</span> Run temporal demo
            </button>
          </div>

          <label>
            <span>Who is speaking?</span>
            <input value={actorName} onChange={(event) => setActorName(event.target.value)} maxLength={120} disabled={busy} />
          </label>

          <label>
            <span>Conversation turn</span>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={10_000} disabled={busy} />
          </label>

          <div className="preset-row" aria-label="Example memories">
            <span>Try:</span>
            <button onClick={() => setMessage("I prefer dark mode.")} disabled={busy}>Original preference</button>
            <button onClick={() => setMessage("I now use light mode because of accessibility.")} disabled={busy}>Preference update</button>
            <button onClick={() => setMessage("I work at Acme and I am building RecallTrace.")} disabled={busy}>Profile bundle</button>
          </div>

          <div className="recall-controls">
            <label>
              <span>Memory slot</span>
              <select value={predicate} onChange={(event) => setPredicate(event.target.value as CanonicalPredicate)} disabled={busy}>
                {memorySlots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}
              </select>
            </label>
            <label>
              <span>As of (optional)</span>
              <input type="datetime-local" value={asOf} onChange={(event) => setAsOf(event.target.value)} disabled={busy} />
            </label>
          </div>

          <div className="action-row">
            <button className="primary-button" onClick={remember} disabled={busy || !actorName.trim() || !message.trim()}>
              {activity === "storing" ? "Writing graph…" : "Remember this"}<span aria-hidden="true">→</span>
            </button>
            <button className="secondary-button" onClick={recall} disabled={busy || !actorName.trim()}>
              {activity === "recalling" ? "Traversing…" : "Recall slot"}
            </button>
          </div>

          {decisions.length > 0 && (
            <div className="decision-strip" aria-label="Extraction decisions">
              {decisions.map((decision, index) => (
                <span key={`${decision.predicate}-${index}`}>
                  <strong>{decision.decision}</strong> {decision.label}: {decision.value}
                </span>
              ))}
            </div>
          )}

          <div className={`notice ${error ? "notice-error" : ""}`} role="status">
            <span aria-hidden="true">{error ? "!" : "●"}</span>{error ?? notice}
          </div>
        </div>

        <MemoryResult result={result} />
      </section>

      <footer>
        <p>Built for HackHydra · Track 03</p>
        <p>Conversation → Claims → Temporal graph → Verifiable recall</p>
      </footer>
    </main>
  );
}
