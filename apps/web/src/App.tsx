import { useEffect, useState } from "react";
import type {
  AskMemoryResponse,
  CanonicalPredicate,
  MemoryDecisionView,
  RecallResult
} from "@recalltrace/contracts";
import { askMemory, checkHealth, ingestSession, recallMemory } from "./api";
import { MemoryResult } from "./components/MemoryResult";
import { AskPanel } from "./components/AskPanel";
import { BenchmarkPanel } from "./components/BenchmarkPanel";
import { GraphExplorer } from "./components/GraphExplorer";

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
  const [graphRefreshKey, setGraphRefreshKey] = useState(0);
  const [lastAnswer, setLastAnswer] = useState<AskMemoryResponse | null>(null);
  const [demoChecks, setDemoChecks] = useState<Array<{ label: string; value: string }>>([]);

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
      setGraphRefreshKey((key) => key + 1);
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
    const demoActor = `Maya Demo ${String(now).slice(-6)}`;
    setActorName(demoActor);
    setDemoChecks([]);

    try {
      setNotice("Demo 1/8 · storing the original truth…");
      const profile = await ingestSession({
        actorName: demoActor,
        messages: [
          {
            role: "user",
            content: "I work at Acme and I prefer dark mode.",
            occurredAt: new Date(now - 172_800_000).toISOString()
          }
        ]
      });

      setNotice("Demo 2/8 · linking project and location context…");
      const context = await ingestSession({
        actorName: demoActor,
        messages: [
          {
            role: "user",
            content: "I am building RecallTrace and I live in Bengaluru.",
            occurredAt: new Date(now - 86_400_000).toISOString()
          }
        ]
      });

      setNotice("Demo 3/8 · preserving the preference update…");
      const updated = await ingestSession({
        actorName: demoActor,
        messages: [
          {
            role: "user",
            content: "I now use light mode because of accessibility.",
            occurredAt: new Date(now - 43_200_000).toISOString()
          }
        ]
      });

      setNotice("Demo 4/8 · retaining an out-of-order contradiction…");
      const conflict = await ingestSession({
        actorName: demoActor,
        messages: [
          {
            role: "user",
            content: "I prefer dark mode.",
            occurredAt: new Date(now - 64_800_000).toISOString()
          }
        ]
      });

      setNotice("Demo 5/8 · adding independent supporting evidence…");
      const support = await ingestSession({
        actorName: demoActor,
        messages: [
          {
            role: "user",
            content: "I use light mode because it reduces eye strain.",
            occurredAt: new Date(now).toISOString()
          }
        ]
      });

      setNotice("Demo 6/8 · asking for the current truth…");
      const currentAnswer = await askMemory({
        actorName: demoActor,
        question: "What theme do I prefer now?"
      });
      setNotice("Demo 7/8 · reconstructing historical truth…");
      const historicalAnswer = await askMemory({
        actorName: demoActor,
        question: "What theme did I prefer?",
        asOf: new Date(now - 86_400_000).toISOString()
      });
      setNotice("Demo 8/8 · proving safe abstention…");
      const unsupportedAnswer = await askMemory({
        actorName: demoActor,
        question: "What is my favourite food?"
      });

      setMessage("I now use light mode because of accessibility.");
      setPredicate("preferred_theme");
      setDecisions([
        ...profile.extractedClaims,
        ...context.extractedClaims,
        ...updated.extractedClaims,
        ...conflict.extractedClaims,
        ...support.extractedClaims
      ]);
      setResult(support.recall);
      setLastAnswer(currentAnswer);
      setGraphRefreshKey((key) => key + 1);
      setDemoChecks([
        { label: "Current", value: answerValue(currentAnswer) },
        { label: "Historical", value: answerValue(historicalAnswer) },
        {
          label: "Unsupported",
          value: unsupportedAnswer.answered ? "answered" : "abstained safely"
        }
      ]);
      setNotice("Presentation demo complete · update, conflict, history, evidence, and abstention are visible.");
    } catch (caught) {
      showError(caught);
    } finally {
      setActivity("idle");
    }
  }

  function handleAnswer(response: AskMemoryResponse) {
    setLastAnswer(response);
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

      <AskPanel
        actorName={actorName}
        externalResponse={lastAnswer}
        onResponse={handleAnswer}
      />
      <GraphExplorer
        actorName={actorName}
        refreshKey={graphRefreshKey}
        highlightedNodeIds={answerNodeIds(lastAnswer)}
      />
      <BenchmarkPanel />

      <section className="workspace" aria-label="RecallTrace memory workspace">
        <div className="composer-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">01 · Ingest and recall</p>
              <h2>Build an evolving memory.</h2>
            </div>
            <button className="demo-button" onClick={runDemo} disabled={busy}>
              <span aria-hidden="true">▶</span> Run presentation demo
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

          {demoChecks.length > 0 && (
            <div className="demo-checks" aria-label="Presentation demo checks">
              {demoChecks.map((check) => (
                <div key={check.label}>
                  <span>{check.label}</span>
                  <strong>{check.value}</strong>
                </div>
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

function answerNodeIds(response: AskMemoryResponse | null): string[] {
  return response?.answered
    ? [...new Set(response.evidence.flatMap((item) => item.graphNodeIds))]
    : [];
}

function answerValue(response: AskMemoryResponse): string {
  return response.answered
    ? response.evidence.map((item) => item.claim.value).join(", ")
    : "abstained";
}
