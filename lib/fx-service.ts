/**
 * Unified FX Service
 *
 * Provides a single interface for FX quoting regardless of the active mode.
 * - Legacy mode: Returns null (the hook reads on-chain getBatchEstimatedOutputs)
 * - StableFX mode: Calls the Next.js API route which proxies to Circle API
 *
 * This service runs client-side and calls our own API routes (not Circle directly).
 */

import { isStableFxMode } from "./fx-config";
import type { FxQuote, FxTrade } from "./stablefx";

// ─── Types ──────────────────────────────────────────────────────────

export interface FxQuoteParams {
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: string;
  recipientAddress?: string;
}

// ─── Client-side API helpers (call our own Next.js routes) ──────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `API error ${res.status}`);
  }
  return json.data as T;
}

/**
 * Request an FX quote.
 * - StableFX mode: calls /api/fx/quote → Circle StableFX API
 * - Legacy mode: returns null (caller should use on-chain estimation)
 */
export async function getQuote(
  params: FxQuoteParams
): Promise<FxQuote | null> {
  if (!isStableFxMode) return null;

  return apiFetch<FxQuote>("/api/fx/quote", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Execute an FX trade using a previously obtained quote.
 * Only available in StableFX mode.
 *
 * Permit2 execution flow:
 * 1. Frontend receives typedData from the quote response
 * 2. User signs typedData via eth_signTypedData_v4 (Privy or MetaMask)
 * 3. The hex signature is passed here
 * 4. Circle's FxEscrow pulls tokens via Permit2 and settles atomically
 */
export async function executeFxTrade(params: {
  quoteId: string;
  senderAddress: string;
  signature: string;
  referenceId?: string;
}): Promise<FxTrade> {
  if (!isStableFxMode) {
    throw new Error("executeFxTrade is only available in StableFX mode");
  }

  return apiFetch<FxTrade>("/api/fx/execute", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Check the settlement status of an in-flight trade.
 * Only available in StableFX mode.
 */
export async function getFxTradeStatus(tradeId: string): Promise<FxTrade> {
  if (!isStableFxMode) {
    throw new Error("getFxTradeStatus is only available in StableFX mode");
  }

  return apiFetch<FxTrade>(`/api/fx/status/${encodeURIComponent(tradeId)}`);
}
