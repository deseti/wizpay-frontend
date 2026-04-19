export class BackendApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: string
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

export async function backendFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(buildBackendUrl(path), {
    ...init,
    cache: "no-store",
    headers,
  });

  const payload = await readJson(response);

  if (!response.ok) {
    const errorPayload = isRecord(payload) ? payload : {};

    throw new BackendApiError(
      getString(errorPayload.error) || `Backend request failed with status ${response.status}`,
      response.status,
      getString(errorPayload.code),
      getString(errorPayload.details)
    );
  }

  if (!isRecord(payload) || !("data" in payload)) {
    throw new BackendApiError(
      "Backend response did not include a data payload.",
      502,
      "BACKEND_EMPTY_RESPONSE"
    );
  }

  return payload.data as T;
}

function buildBackendUrl(path: string): string {
  const baseUrl =
    process.env.BACKEND_API_BASE_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_BASE_URL ||
    "http://localhost:4000";
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  return new URL(path.replace(/^\//, ""), normalizedBaseUrl).toString();
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}