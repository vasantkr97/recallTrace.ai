import type { RecallNotFound } from "@recalltrace/contracts";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { ClaimRepository } from "./hydradb/claimRepository.js";
import type { HydraConnection } from "./hydradb/hydraConnection.js";
import {
  MemoryExtractionError,
  type MemoryService
} from "./memory/memoryService.js";
import { canonicalPredicateSchema } from "./memory/claimSchema.js";
import type { MemoryAnswerService } from "./memory/memoryAnswerService.js";

export type AppDependencies = {
  webOrigin: string;
  connection: HydraConnection;
  claims: ClaimRepository;
  memory: MemoryService;
  answers: MemoryAnswerService;
};

const conversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(10_000),
  occurredAt: z.iso.datetime({ offset: true }).optional()
});

const ingestSessionSchema = z.object({
  actorName: z.string().trim().min(1).max(120),
  messages: z.array(conversationMessageSchema).min(1).max(100)
});

const recallQuerySchema = z.object({
  actor: z.string().trim().min(1).max(120),
  predicate: canonicalPredicateSchema.default("preferred_theme"),
  asOf: z.iso.datetime({ offset: true }).optional()
});

const askMemorySchema = z.object({
  actorName: z.string().trim().min(1).max(120),
  question: z.string().trim().min(3).max(1_000),
  asOf: z.iso.datetime({ offset: true }).optional()
});

export function createApp(dependencies: AppDependencies) {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors({ origin: dependencies.webOrigin }));
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

  app.post("/api/sessions", async (request, response, next) => {
    const parsed = ingestSessionSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid conversation session",
        details: z.flattenError(parsed.error)
      });
      return;
    }

    try {
      const result = await dependencies.memory.ingestSession(
        parsed.data
      );
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/recall", async (request, response, next) => {
    const parsed = recallQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid recall query",
        details: z.flattenError(parsed.error)
      });
      return;
    }

    try {
      const result = await dependencies.memory.recall(
        parsed.data.actor,
        parsed.data.predicate,
        parsed.data.asOf
      );

      if (!result) {
        const notFound: RecallNotFound = {
          found: false,
          actor: parsed.data.actor,
          predicate: parsed.data.predicate,
          reason: "NO_MATCHING_MEMORY"
        };
        response.status(404).json(notFound);
        return;
      }

      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ask", async (request, response, next) => {
    const parsed = askMemorySchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid memory question",
        details: z.flattenError(parsed.error)
      });
      return;
    }

    try {
      const result = await dependencies.answers.answer(parsed.data);
      response.json(result);
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
      const status = error instanceof MemoryExtractionError ? 422 : 500;
      response.status(status).json({ error: message });
    }
  );

  return app;
}
