import { useState } from "react";
import type { AskMemoryResponse } from "@recalltrace/contracts";
import { askMemory } from "../api";

type AskPanelProps = {
  actorName: string;
};

const sampleQuestions = [
  "What theme do I prefer now?",
  "What theme did I prefer previously?",
  "Where do I live and what am I building?",
  "What is my favourite food?"
];

export function AskPanel({ actorName }: AskPanelProps) {
  const [question, setQuestion] = useState(sampleQuestions[0]!);
  const [response, setResponse] = useState<AskMemoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setLoading(true);
    setError(null);

    try {
      setResponse(await askMemory({ actorName, question }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The question could not be answered.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="ask-card" aria-label="Ask RecallTrace">
      <div className="ask-intro">
        <p className="eyebrow">Ask RecallTrace</p>
        <h2>Question the memory graph.</h2>
        <p>Natural-language answers grounded only in traversed evidence.</p>
      </div>

      <div className="ask-workspace">
        <div className="ask-input-row">
          <input
            aria-label="Memory question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !loading && question.trim()) {
                void ask();
              }
            }}
            placeholder="Ask what is true now, before, or at a date…"
            maxLength={1_000}
          />
          <button onClick={ask} disabled={loading || !actorName.trim() || !question.trim()}>
            {loading ? "Traversing…" : "Ask graph"}<span aria-hidden="true">↗</span>
          </button>
        </div>

        <div className="question-presets">
          {sampleQuestions.map((sample) => (
            <button key={sample} onClick={() => setQuestion(sample)} disabled={loading}>{sample}</button>
          ))}
        </div>

        {error && <div className="ask-error" role="alert">{error}</div>}
        {response && <AnswerResult response={response} />}
      </div>
    </section>
  );
}

function AnswerResult({ response }: { response: AskMemoryResponse }) {
  if (!response.answered) {
    return (
      <div className="abstention-card" aria-live="polite">
        <div className="abstention-icon" aria-hidden="true">∅</div>
        <div>
          <span>{response.reason.replaceAll("_", " ")}</span>
          <h3>RecallTrace chose not to guess.</h3>
          <p>{response.message}</p>
        </div>
        <TraceList trace={response.trace} />
      </div>
    );
  }

  return (
    <div className="answer-card" aria-live="polite">
      <div className="answer-topline">
        <span>Grounded answer</span>
        <strong>{Math.round(response.confidence * 100)}% confidence</strong>
      </div>
      <h3>{response.answer}</h3>

      <div className="coverage-row">
        <div><strong>{response.coverage.answered.length}/{response.coverage.requested.length}</strong><span>slots covered</span></div>
        <div className="coverage-track"><span style={{ width: `${response.coverage.ratio * 100}%` }} /></div>
        <code>{response.temporalMode.replace("_", " ")}</code>
      </div>

      <div className="answer-evidence">
        {response.evidence.map(({ claim, graphPath }) => (
          <article key={`${claim.predicate}-${claim.evidence.sessionId}`}>
            <span>{claim.label}</span>
            <strong>{claim.value}</strong>
            <blockquote>“{claim.evidence.content}”</blockquote>
            <code>{graphPath.join(" → ")}</code>
          </article>
        ))}
      </div>

      {response.conflicts.length > 0 && (
        <p className="answer-conflict">⚠ {response.conflicts.length} conflicting claim{response.conflicts.length === 1 ? " was" : "s were"} preserved in the graph.</p>
      )}

      <TraceList trace={response.trace} />
    </div>
  );
}

function TraceList({ trace }: { trace: AskMemoryResponse["trace"] }) {
  return (
    <details className="retrieval-trace">
      <summary>Inspect retrieval trace <span>{trace.length} stages</span></summary>
      <ol>
        {trace.map((step) => (
          <li key={step.stage} className={`trace-${step.status}`}>
            <span />
            <div><strong>{step.stage.replaceAll("_", " ")}</strong><p>{step.detail}</p></div>
          </li>
        ))}
      </ol>
    </details>
  );
}
