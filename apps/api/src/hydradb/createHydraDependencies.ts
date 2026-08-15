import { readEnvironment } from "../config/environment.js";
import { ClaimRepository } from "./claimRepository.js";
import { HydraConnection } from "./hydraConnection.js";

export function createHydraDependencies() {
  const environment = readEnvironment();
  const connection = HydraConnection.fromEnvironment(environment);
  const claims = new ClaimRepository(connection);

  return {
    environment,
    connection,
    claims
  };
}
