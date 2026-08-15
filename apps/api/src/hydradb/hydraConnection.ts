import neo4j, {
  type Driver,
  type QueryResult,
  type RecordShape,
  type SessionMode
} from "neo4j-driver";
import type { Environment } from "../config/environment.js";

/**
 * Owns the Bolt driver and provides small autocommit query helpers.
 *
 * HydraDB deliberately does not support Neo4j-style explicit transactions.
 * Calling session.run() keeps every query in the supported autocommit path.
 */
export class HydraConnection {
  private constructor(
    private readonly driver: Driver,
    private readonly database: string
  ) {}

  static fromEnvironment(environment: Environment): HydraConnection {
    const driver = neo4j.driver(
      environment.HYDRADB_BOLT_URL,
      neo4j.auth.basic(
        environment.HYDRADB_USERNAME,
        environment.HYDRADB_AUTH_TOKEN
      ),
      {
        disableLosslessIntegers: true,
        connectionAcquisitionTimeout: 10_000,
        maxConnectionPoolSize: 10
      }
    );

    return new HydraConnection(driver, environment.HYDRADB_DATABASE);
  }

  async verifyConnectivity(): Promise<void> {
    await this.driver.verifyConnectivity({ database: this.database });
  }

  async read<T extends RecordShape = RecordShape>(
    query: string,
    parameters: Record<string, unknown> = {}
  ): Promise<QueryResult<T>> {
    return this.run(query, parameters, neo4j.session.READ);
  }

  async write<T extends RecordShape = RecordShape>(
    query: string,
    parameters: Record<string, unknown> = {}
  ): Promise<QueryResult<T>> {
    return this.run(query, parameters, neo4j.session.WRITE);
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  private async run<T extends RecordShape>(
    query: string,
    parameters: Record<string, unknown>,
    accessMode: SessionMode
  ): Promise<QueryResult<T>> {
    const session = this.driver.session({
      database: this.database,
      defaultAccessMode: accessMode
    });

    try {
      return await session.run<T>(query, encodeParameters(parameters));
    } finally {
      await session.close();
    }
  }
}

/**
 * The Neo4j driver serializes plain JavaScript numbers as floating-point values.
 * HydraDB uses non-negative integer ids, so safe whole numbers must be encoded
 * explicitly as Bolt integers, including ids nested inside UNWIND batches.
 */
function encodeParameters(
  parameters: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(parameters).map(([key, value]) => [key, encodeValue(value)])
  );
}

function encodeValue(value: unknown): unknown {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return neo4j.int(value);
  }

  if (Array.isArray(value)) {
    return value.map(encodeValue);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        encodeValue(nestedValue)
      ])
    );
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}
