import type {
  AskMemoryRequest,
  AskMemoryResponse,
  BenchmarkSummaryResponse,
  CanonicalPredicate,
  IngestSessionRequest,
  IngestSessionResponse,
  MemoryGraphResponse,
  RecallResult
} from "@recalltrace/contracts";

const apiUrl = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(
  /\/$/,
  ""
);

export async function ingestSession(
  request: IngestSessionRequest
): Promise<IngestSessionResponse> {
  return requestJson<IngestSessionResponse>(`${apiUrl}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request)
  });
}

export async function recallMemory(
  actor: string,
  predicate: CanonicalPredicate = "preferred_theme",
  asOf?: string
): Promise<RecallResult> {
  const query = new URLSearchParams({ actor, predicate });

  if (asOf) {
    query.set("asOf", asOf);
  }

  return requestJson<RecallResult>(`${apiUrl}/api/recall?${query}`);
}

export async function checkHealth(): Promise<boolean> {
  try {
    const health = await requestJson<{ status: string; hydradb: string }>(
      `${apiUrl}/health`
    );
    return health.status === "ok" && health.hydradb === "connected";
  } catch {
    return false;
  }
}

export async function askMemory(
  request: AskMemoryRequest
): Promise<AskMemoryResponse> {
  return requestJson<AskMemoryResponse>(`${apiUrl}/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request)
  });
}

export async function getBenchmarkSummary(): Promise<BenchmarkSummaryResponse> {
  return requestJson<BenchmarkSummaryResponse>(`${apiUrl}/api/benchmark`);
}

export async function getMemoryGraph(actor: string): Promise<MemoryGraphResponse> {
  const query = new URLSearchParams({ actor });
  return requestJson<MemoryGraphResponse>(`${apiUrl}/api/graph?${query}`);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body: unknown = await response.json();

  if (!response.ok) {
    const message = readErrorMessage(body);
    throw new Error(message);
  }

  return body as T;
}

function readErrorMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

  return "No matching memory was found.";
}
