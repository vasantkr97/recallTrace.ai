import type {
  AbstentionReason,
  CanonicalPredicate
} from "@recalltrace/contracts";
import { z } from "zod";

export const benchmarkProfileSchema = z.object({
  id: z.string().min(1),
  actor: z.string().min(1),
  originalTheme: z.enum(["dark mode", "light mode"]),
  currentTheme: z.enum(["dark mode", "light mode"]),
  originalEmployer: z.string().min(1),
  currentEmployer: z.string().min(1),
  currentCity: z.string().min(1),
  destinationCity: z.string().min(1),
  project: z.string().min(1),
  goal: z.string().min(1)
});

export const benchmarkFixtureSchema = z.object({
  version: z.string().min(1),
  profiles: z.array(benchmarkProfileSchema).min(1)
});

export type BenchmarkProfile = z.infer<typeof benchmarkProfileSchema>;

export type BenchmarkCategory =
  | "current"
  | "temporal"
  | "multi_part"
  | "absent";

export type BenchmarkSession = {
  content: string;
  occurredAt: string;
};

export type BenchmarkQuestion = {
  id: string;
  category: BenchmarkCategory;
  question: string;
  expected: {
    answered: boolean;
    values: Partial<Record<CanonicalPredicate, string>>;
    minimumConflicts?: number;
  };
};

export type BenchmarkScenario = {
  profile: BenchmarkProfile;
  sessions: BenchmarkSession[];
  questions: BenchmarkQuestion[];
};

export type BenchmarkPrediction = {
  questionId: string;
  category: BenchmarkCategory;
  answered: boolean;
  values: Partial<Record<CanonicalPredicate, string>>;
  evidenceCount: number;
  conflictCount: number;
  latencyMs: number;
  reason?: AbstentionReason | "NO_VECTOR_MATCH";
};

export type CaseEvaluation = BenchmarkPrediction & {
  correct: boolean;
  expectedAnswered: boolean;
  expectedValues: Partial<Record<CanonicalPredicate, string>>;
  matchedValues: number;
  expectedValueCount: number;
};

export type BenchmarkMetrics = {
  questionAccuracy: number;
  temporalAccuracy: number;
  abstentionAccuracy: number;
  evidencePrecision: number;
  multiPartCoverage: number;
  conflictDetectionAccuracy: number;
  averageLatencyMs: number;
};

export type EvaluatedSystem = {
  system: string;
  description: string;
  metrics: BenchmarkMetrics;
  cases: CaseEvaluation[];
};

export type BenchmarkReport = {
  metadata: {
    suite: "smoke" | "full";
    fixtureVersion: string;
    generatedAt: string;
    profileCount: number;
    questionCount: number;
    datasetLabel: string;
    methodology: string;
    limitations: string[];
  };
  recallTrace: EvaluatedSystem;
  vectorBaseline: EvaluatedSystem;
  delta: Record<keyof BenchmarkMetrics, number>;
  failureAnalysis: {
    recallTraceFailures: number;
    vectorBaselineFailures: number;
    vectorFailuresByCategory: Partial<Record<BenchmarkCategory, number>>;
  };
};
