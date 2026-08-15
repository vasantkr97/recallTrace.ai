import express, { type NextFunction, type Request, type Response } from "express";
import type { ClaimRepository } from "./hydradb/claimRepository.js";
import type { HydraConnection } from "./hydradb/hydraConnection.js";

export type AppDependencies = {
  connection: HydraConnection;
  claims: ClaimRepository;
};

export function createApp(dependencies: AppDependencies) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (_request, response, next) => {
    try {
      await dependencies.connection.verifyConnectivity();
      response.json({ status: "ok", hydradb: "connected" });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/milestones/1", async (_request, response, next) => {
    try {
      const history = await dependencies.claims.getMayaPreferenceHistory();

      if (!history) {
        response.status(404).json({
          error: "Milestone 1 fixture has not been seeded"
        });
        return;
      }

      response.json(history);
    } catch (error) {
      next(error);
    }
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction
    ) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      response.status(500).json({ error: message });
    }
  );

  return app;
}
