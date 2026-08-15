import { createApp } from "./app.js";
import { createHydraDependencies } from "./hydradb/createHydraDependencies.js";

const dependencies = createHydraDependencies();

await dependencies.connection.verifyConnectivity();

const app = createApp(dependencies);
const server = app.listen(dependencies.environment.API_PORT, () => {
  console.log(
    `RecallTrace API listening on http://localhost:${dependencies.environment.API_PORT}`
  );
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}; closing RecallTrace cleanly.`);

  server.close(async () => {
    await dependencies.connection.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
