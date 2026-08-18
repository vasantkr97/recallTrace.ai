import { readFile } from "node:fs/promises";
import type { BenchmarkSummaryResponse } from "@recalltrace/contracts";
import { resolveProjectPath } from "../config/environment.js";
import type { BenchmarkReport } from "./types.js";

export class BenchmarkReportReader {
  async readSummary(): Promise<BenchmarkSummaryResponse> {
    const path = resolveProjectPath("benchmarks", "results", "full.json");
    const report = JSON.parse(await readFile(path, "utf8")) as BenchmarkReport;

    if (report.metadata?.suite !== "full" || !report.recallTrace?.metrics) {
      throw new Error("The full benchmark report is missing or invalid");
    }

    return {
      suite: report.metadata.suite,
      generatedAt: report.metadata.generatedAt,
      questionCount: report.metadata.questionCount,
      datasetLabel: report.metadata.datasetLabel,
      recallTrace: report.recallTrace.metrics,
      vectorBaseline: report.vectorBaseline.metrics,
      delta: report.delta,
      limitations: report.metadata.limitations
    };
  }
}
