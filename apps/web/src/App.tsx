import { useEffect, useState } from "react";
import type { RecallResult } from "@recalltrace/contracts";
import { checkHealth, ingestSession, recallMemory } from "./api";
import { MemoryResult } from "./components/MemoryResult";

type ActivityState = "idle" | "storing" | "recalling" | "demo";

export function App() {
  const [actorName, setActorName] = useState("Maya");
  const [message, setMessage] = useState("I prefer dark mode.");
  const [result, setResult] = useState<RecallResult | null>(null);
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
    setNotice("Extracting a claim and writing its evidence graph…");

    try {
      const response = await ingestSession({
        actorName,
        messages: [{ role: "user", content: message }]
      });
      setResult(response.recall);
      setNotice(
        `Stored ${response.storedTurns} turn and recalled ${response.extractedClaim.value}.`
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
    setNotice("Traversing Actor → Claim → Evidence…");

    try {
      const recalled = await recallMemory(actorName);
      setResult(recalled);
      setNotice("Current memory and its evidence were retrieved from HydraDB.");
    } catch (caught) {
      showError(caught);
    } finally {
      setActivity("idle");
    }
  }

  async function runDemo() {
    setActivity("demo");
    setError(null);

    try {
      setNotice("Demo 1/2 · storing the original dark mode preference…");
      await ingestSession({
        actorName,
        messages: [
          {
            role: "user",
            content: "I prefer dark mode.",
            occurredAt: new Date(Date.now() - 86_400_000).toISOString()
          }
        ]
      });

      setNotice("Demo 2/2 · preserving the update to light mode…");
      const updated = await ingestSession({
        actorName,
        messages: [
          {
            role: "user",
            content: "I now use light mode because of accessibility.",
            occurredAt: new Date().toISOString()
          }
        ]
      });
      setMessage("I now use light mode because of accessibility.");
      setResult(updated.recall);
      setNotice("Demo complete · the update and original evidence are both traceable.");
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
          {connected === null
            ? "Checking HydraDB"
            : connected
              ? "HydraDB connected"
              : "HydraDB unavailable"}
        </div>
      </nav>

      <header className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Graph-native memory for AI agents</p>
          <h1>Memory should evolve.<br /><span>Not disappear.</span></h1>
          <p className="hero-description">
            RecallTrace remembers what changed, why it changed, and the exact
            conversation that proves it.
          </p>
        </div>
        <div className="hero-proof" aria-label="RecallTrace principles">
          <div><strong>Temporal</strong><span>Never overwrite history</span></div>
          <div><strong>Explainable</strong><span>Every answer has evidence</span></div>
          <div><strong>Graph-native</strong><span>Context lives in relationships</span></div>
        </div>
      </header>

      <section className="workspace" aria-label="RecallTrace memory workspace">
        <div className="composer-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">01 · Ingest</p>
              <h2>Teach the agent something.</h2>
            </div>
            <button className="demo-button" onClick={runDemo} disabled={busy}>
              <span aria-hidden="true">▶</span> Run golden demo
            </button>
          </div>

          <label>
            <span>Who is speaking?</span>
            <input
              value={actorName}
              onChange={(event) => setActorName(event.target.value)}
              maxLength={120}
              disabled={busy}
            />
          </label>

          <label>
            <span>Conversation turn</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              maxLength={10_000}
              disabled={busy}
            />
          </label>

          <div className="preset-row" aria-label="Example memories">
            <span>Try:</span>
            <button onClick={() => setMessage("I prefer dark mode.")} disabled={busy}>Original preference</button>
            <button onClick={() => setMessage("I now use light mode because of accessibility.")} disabled={busy}>Preference update</button>
          </div>

          <div className="action-row">
            <button className="primary-button" onClick={remember} disabled={busy || !actorName.trim() || !message.trim()}>
              {activity === "storing" ? "Writing graph…" : "Remember this"}
              <span aria-hidden="true">→</span>
            </button>
            <button className="secondary-button" onClick={recall} disabled={busy || !actorName.trim()}>
              {activity === "recalling" ? "Traversing…" : "Recall latest"}
            </button>
          </div>

          <div className={`notice ${error ? "notice-error" : ""}`} role="status">
            <span aria-hidden="true">{error ? "!" : "●"}</span>
            {error ?? notice}
          </div>
        </div>

        <MemoryResult result={result} />
      </section>

      <footer>
        <p>Built for HackHydra · Track 03</p>
        <p>Conversation → Claims → Graph traversal → Verifiable recall</p>
      </footer>
    </main>
  );
}
