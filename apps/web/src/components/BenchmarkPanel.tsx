import { useEffect, useState } from "react";
import type {
  BenchmarkMetricSet,
  BenchmarkSummaryResponse
} from "@recalltrace/contracts";
import { getBenchmarkSummary } from "../api";

type PercentageMetric = Exclude<keyof BenchmarkMetricSet, "averageLatencyMs">;

const metrics: Array<{ key: PercentageMetric; label: string }> = [
  { key: "questionAccuracy", label: "Question accuracy" },
  { key: "temporalAccuracy", label: "Temporal accuracy" },
  { key: "evidencePrecision", label: "Evidence precision" },
  { key: "multiPartCoverage", label: "Multi-part coverage" },
  { key: "conflictDetectionAccuracy", label: "Conflict detection" }
];

export function BenchmarkPanel() {
  const [report, setReport] = useState<BenchmarkSummaryResponse | null>(null);

  useEffect(() => {
    void getBenchmarkSummary().then(setReport).catch(() => setReport(null));
  }, []);

  if (!report) {
    return null;
  }

  return (
    <section className="benchmark-card" aria-label="Benchmark comparison">
      <div className="benchmark-heading">
        <div>
          <p className="eyebrow">Measured proof · {report.questionCount} fixed questions</p>
          <h2>Graph memory wins where similarity forgets.</h2>
          <p>{report.datasetLabel}</p>
        </div>
        <div className="benchmark-legend">
          <span><i className="legend-recall" /> RecallTrace</span>
          <span><i className="legend-vector" /> Vector-only</span>
        </div>
      </div>

      <div className="benchmark-grid">
        {metrics.map(({ key, label }) => (
          <article key={key}>
            <div className="benchmark-label">
              <span>{label}</span>
              <strong>{percent(report.recallTrace[key])}<em> vs {percent(report.vectorBaseline[key])}</em></strong>
            </div>
            <div className="benchmark-bars">
              <span className="recall-bar" style={{ width: percent(report.recallTrace[key]) }} />
              <span className="vector-bar" style={{ width: percent(report.vectorBaseline[key]) }} />
            </div>
          </article>
        ))}
      </div>

      <div className="benchmark-footer">
        <p>
          <strong>{report.recallTrace.averageLatencyMs.toFixed(1)}ms</strong> graph retrieval
          <span>vs</span>
          <strong>{report.vectorBaseline.averageLatencyMs.toFixed(1)}ms</strong> vector retrieval
        </p>
        <details>
          <summary>Methodology limits</summary>
          <ul>{report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
        </details>
      </div>
    </section>
  );
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
