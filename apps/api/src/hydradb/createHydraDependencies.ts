import { readEnvironment } from "../config/environment.js";
import { PreferenceClaimExtractor } from "../memory/claimExtractor.js";
import { MemoryService } from "../memory/memoryService.js";
import { ClaimRepository } from "./claimRepository.js";
import { HydraConnection } from "./hydraConnection.js";
import { MemoryRepository } from "./memoryRepository.js";

export function createHydraDependencies() {
  const environment = readEnvironment();
  const connection = HydraConnection.fromEnvironment(environment);
  const claims = new ClaimRepository(connection);
  const memoryRepository = new MemoryRepository(connection);
  const extractor = new PreferenceClaimExtractor();
  const memory = new MemoryService(memoryRepository, extractor);

  return {
    environment,
    webOrigin: environment.WEB_ORIGIN,
    connection,
    claims,
    memory
  };
}
