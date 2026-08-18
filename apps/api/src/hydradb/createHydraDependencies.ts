import { readEnvironment } from "../config/environment.js";
import { BenchmarkReportReader } from "../benchmark/benchmarkReportReader.js";
import { StructuredClaimExtractor } from "../memory/claimExtractor.js";
import { EntityResolver } from "../memory/entityResolver.js";
import { MemoryService } from "../memory/memoryService.js";
import { MemoryAnswerService } from "../memory/memoryAnswerService.js";
import { QuestionAnalyzer } from "../memory/questionAnalyzer.js";
import { CanonicalSeedProvider } from "../memory/retrievalSeedProvider.js";
import { TemporalDecisionEngine } from "../memory/temporalDecisionEngine.js";
import { ClaimRepository } from "./claimRepository.js";
import { HydraConnection } from "./hydraConnection.js";
import { MemoryRepository } from "./memoryRepository.js";
import { GraphRepository } from "./graphRepository.js";
import { GraphService } from "../memory/graphService.js";

export function createHydraDependencies() {
  const environment = readEnvironment();
  const connection = HydraConnection.fromEnvironment(environment);
  const claims = new ClaimRepository(connection);
  const decisionEngine = new TemporalDecisionEngine();
  const memoryRepository = new MemoryRepository(connection, decisionEngine);
  const extractor = new StructuredClaimExtractor();
  const entities = new EntityResolver();
  const memory = new MemoryService(memoryRepository, extractor, entities);
  const questions = new QuestionAnalyzer();
  const seeds = new CanonicalSeedProvider();
  const answers = new MemoryAnswerService(memory, questions, seeds, entities);
  const graph = new GraphService(new GraphRepository(connection), entities);
  const benchmark = new BenchmarkReportReader();

  return {
    environment,
    webOrigin: environment.WEB_ORIGIN,
    connection,
    claims,
    memory,
    answers,
    graph,
    benchmark
  };
}
