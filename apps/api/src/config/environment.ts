import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const projectEnvironmentPath = fileURLToPath(
  new URL("../../../../.env", import.meta.url)
);

dotenv.config({
  path: process.env.RECALLTRACE_ENV_FILE ?? projectEnvironmentPath,
  quiet: true
});

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  HYDRADB_BOLT_URL: z.string().startsWith("bolt://"),
  HYDRADB_USERNAME: z.string().min(1).default("neo4j"),
  HYDRADB_AUTH_TOKEN: z.string().min(32),
  HYDRADB_DATABASE: z.string().min(1).default("default")
});

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(): Environment {
  const result = environmentSchema.safeParse(process.env);

  if (!result.success) {
    const details = z.prettifyError(result.error);
    throw new Error(`Invalid RecallTrace environment:\n${details}`);
  }

  return result.data;
}

export function resolveProjectPath(...segments: string[]): string {
  const projectRoot = path.dirname(projectEnvironmentPath);
  return path.join(projectRoot, ...segments);
}
