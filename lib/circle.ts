/**
 * Circle StableFX API Client
 *
 * Production client for Circle's institutional FX settlement API.
 * Uses native fetch for compatibility with Next.js Edge/Serverless runtime.
 *
 * Environment variables:
 *   CIRCLE_API_KEY   — API key in format "PREFIX:ID:SECRET"
 *                      e.g. "TEST_API_KEY:abc123...:def456..."
 *   CIRCLE_BASE_URL  — Base URL (default: https://api.circle.com)
 *                      Note: Circle uses the SAME base URL for testnet and
 *                      mainnet. The key prefix (TEST_ vs LIVE_) determines
 *                      the environment. Do NOT use api-sandbox.circle.com.
 *
 * ── Future integration points ──
 * • Permit2: The quote response includes `typedData` — a pre-built EIP-712
 *   PermitWitnessTransferFrom message. The frontend must prompt the user to
 *   sign this typed data, then include the signature when creating a trade.
 * • FxEscrow Settlement: After createTrade() returns, Circle's FxEscrow
 *   contract handles atomic settlement on-chain via the Permit2 allowance.
 */

// ─── Configuration ──────────────────────────────────────────────────

function getConfig() {
  const apiKey = process.env.CIRCLE_API_KEY;
  // Circle uses the SAME host for testnet & mainnet.
  // The key prefix (TEST_ vs LIVE_) determines the environment.
  const baseUrl = (
    process.env.CIRCLE_BASE_URL || "https://api.circle.com"
  ).replace(/\/+$/, "");

  return { apiKey, baseUrl };
}

// ─── Error Types ────────────────────────────────────────────────────

export class CircleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "CircleApiError";
  }
}

// ─── HTTP Helper ────────────────────────────────────────────────────

async function circleFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { apiKey, baseUrl } = getConfig();

  if (!apiKey) {
    throw new CircleApiError(
      "CIRCLE_API_KEY is not configured. Set it in your environment variables.",
      401,
      "MISSING_API_KEY"
    );
  }

  const url = `${baseUrl}${path}`;

  // Auth mask logic
  const authType = apiKey.startsWith("TEST_API_KEY") ? "TEST_API_KEY" : (apiKey.startsWith("LIVE_API_KEY") ? "LIVE_API_KEY" : "UNKNOWN_PREFIX");
  const authMasked = authType !== "UNKNOWN_PREFIX" && apiKey.includes(":") 
    ? `${authType}:***:${apiKey.split(":").pop()?.substring(0, 4)}...`
    : `${apiKey.substring(0, 8)}...`;

  // Deep debugging logs
  console.log(`[Circle Debug] → ${options.method || "GET"} ${url}`);
  console.log(`[Circle Debug] Auth Prefix Format: Bearer ${authMasked}`);
  if (options.body) {
    console.log(`[Circle Debug] Request Body:`, typeof options.body === 'string' ? JSON.parse(options.body) : options.body);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...options.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new CircleApiError(
        "Circle API request timed out after 15 seconds",
        504,
        "TIMEOUT"
      );
    }
    throw new CircleApiError(
      `Network error contacting Circle API: ${err instanceof Error ? err.message : String(err)}`,
      502,
      "NETWORK_ERROR"
    );
  }

  console.log(`[Circle] ← ${res.status} ${res.statusText}`);

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => null);
    }

    console.error(`[Circle] Error body:`, JSON.stringify(body, null, 2));

    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as Record<string, unknown>).message)
        : `Circle API returned ${res.status}`;

    const code =
      typeof body === "object" && body !== null && "code" in body
        ? String((body as Record<string, unknown>).code)
        : undefined;

    throw new CircleApiError(message, res.status, code, body);
  }

  return res.json() as Promise<T>;
}

// ─── Circle StableFX API Types ──────────────────────────────────────
// Based on: https://developers.circle.com/api-reference/stablefx/all/create-quote

export interface CircleQuoteRequest {
  from: {
    currency: string;
    amount?: string;
  };
  to: {
    currency: string;
    amount?: string;
  };
  tenor: "instant" | "hourly" | "daily";
  type: "tradable" | "reference";
  recipientAddress?: string; // Required for tradable quotes
}

/**
 * Circle quote response shape (official).
 * Note: fields use `rate` (not `exchangeRate`) and `fee` (string, not object).
 * Tradable quotes include `typedData` for Permit2 EIP-712 signing.
 */
export interface CircleQuoteResponse {
  id: string;
  rate: number;
  from: { currency: string; amount: string };
  to: { currency: string; amount: string };
  createdAt: string;
  expiresAt: string;
  fee: string; // denominated in the "to" currency
  collateral?: string; // optional, denominated in "from" currency
  typedData?: CircleTypedData; // Permit2 EIP-712 data (tradable only)
}

/** Permit2 PermitWitnessTransferFrom typed data returned by Circle */
export interface CircleTypedData {
  domain: {
    name: string;
    chainId: number;
    verifyingContract: string;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface CircleTradeRequest {
  quoteId: string;
  signature: string; // EIP-712 signature from the user's wallet
}

export interface CircleTradeResponse {
  id: string;
  quoteId: string;
  status: string;
  from: { currency: string; amount: string };
  to: { currency: string; amount: string };
  rate: number;
  fee: string;
  createdAt: string;
  settledAt?: string | null;
}

// ─── StableFX API Methods ───────────────────────────────────────────

/**
 * POST /v1/exchange/stablefx/quotes
 *
 * Request a live FX quote from Circle's market-making network.
 * For reference quotes (rate check only), use type: "reference".
 * For executable quotes (trade-ready), use type: "tradable" with a recipientAddress.
 */
export async function createQuote(
  req: CircleQuoteRequest
): Promise<CircleQuoteResponse> {
  return circleFetch<CircleQuoteResponse>(
    "/v1/exchange/stablefx/quotes",
    {
      method: "POST",
      body: JSON.stringify(req),
    }
  );
}

/**
 * POST /v1/exchange/stablefx/trades
 *
 * Execute a previously received tradable quote.
 * Requires the user's EIP-712 signature over the typedData
 * returned in the quote response.
 *
 * ── Permit2 flow ──
 * 1. Frontend receives typedData from createQuote() response.
 * 2. User signs the typedData using eth_signTypedData_v4 via their wallet.
 * 3. The hex signature is passed here as `signature`.
 * 4. Circle's FxEscrow contract uses Permit2 to pull the source tokens
 *    and atomically deliver the target tokens to the recipient.
 */
export async function createTrade(
  req: CircleTradeRequest
): Promise<CircleTradeResponse> {
  return circleFetch<CircleTradeResponse>(
    "/v1/exchange/stablefx/trades",
    {
      method: "POST",
      body: JSON.stringify(req),
    }
  );
}

/**
 * GET /v1/exchange/stablefx/trades/{tradeId}
 *
 * Poll for the settlement status of an in-flight trade.
 * Status progression: pending → processing → settled (or failed).
 */
export async function getTradeById(
  tradeId: string
): Promise<CircleTradeResponse> {
  return circleFetch<CircleTradeResponse>(
    `/v1/exchange/stablefx/trades/${encodeURIComponent(tradeId)}`
  );
}
