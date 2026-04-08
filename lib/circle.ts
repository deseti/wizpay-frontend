/**
 * Circle API Client
 *
 * Pre-configured helper for Circle platform API interactions.
 * Currently stubbed — will be wired up once Circle API credentials
 * are provisioned and the StableFX program is available on Arc.
 *
 * Environment variables:
 *   CIRCLE_API_KEY      — Bearer token for Circle API
 *   CIRCLE_BASE_URL     — Base URL (default: https://api.circle.com/v1)
 */

// ─── Configuration ──────────────────────────────────────────────────

function getCircleConfig() {
  return {
    apiKey: process.env.CIRCLE_API_KEY || "",
    baseUrl:
      process.env.CIRCLE_BASE_URL || "https://api.circle.com/v1",
  };
}

// ─── HTTP Helper ────────────────────────────────────────────────────

/**
 * Authenticated fetch wrapper for Circle API endpoints.
 * Returns parsed JSON or throws on non-2xx responses.
 */
export async function circleFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { apiKey, baseUrl } = getCircleConfig();

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Circle API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Wallet Helpers (stubbed) ───────────────────────────────────────

export interface CircleWalletBalance {
  currency: string;
  amount: string;
}

/**
 * Fetch balances for a Circle-managed wallet.
 * Currently returns mock data.
 */
export async function getWalletBalances(
  _walletId: string
): Promise<CircleWalletBalance[]> {
  // TODO: Replace with real Circle API call
  // return circleFetch<CircleWalletBalance[]>(`/wallets/${walletId}/balances`);

  return [
    { currency: "USDC", amount: "10000.00" },
    { currency: "EURC", amount: "8500.00" },
  ];
}
