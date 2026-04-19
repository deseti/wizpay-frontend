/**
 * StableFX Service — Circle Integration Layer
 *
 * Maps Circle StableFX API responses into the WizPay-internal
 * FxQuote / FxTrade types that the frontend already consumes.
 *
 * This layer exists so the API routes and UI never depend on
 * Circle's response shape directly. If the upstream provider
 * changes (e.g. to Arc-native FX routing), only this file needs
 * to be updated.
 */

import {
  createQuote,
  createTrade,
  getTradeById,
  CircleApiError,
  type CircleTypedData,
} from "./circle";

// ─── WizPay Internal Types ──────────────────────────────────────────

export interface FxQuoteRequest {
  sourceCurrency: string; // e.g. "USDC"
  targetCurrency: string; // e.g. "EURC"
  sourceAmount: string; // e.g. "1000.00"
  recipientAddress?: string; // Required for tradable quotes
}

export interface FxQuote {
  quoteId: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: string;
  targetAmount: string;
  exchangeRate: string;
  feeAmount: string;
  feeCurrency: string;
  expiresAt: string; // ISO-8601
  provider: string;
  /** Permit2 EIP-712 typed data for signing (tradable quotes only) */
  typedData?: CircleTypedData;
}

export interface FxTradeRequest {
  quoteId: string;
  senderAddress: string;
  signature: string; // EIP-712 signature from user's wallet
  referenceId?: string;
}

export interface FxTrade {
  tradeId: string;
  quoteId: string;
  status: "pending" | "processing" | "settled" | "failed";
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: string;
  targetAmount: string;
  exchangeRate: string;
  senderAddress: string;
  referenceId: string;
  createdAt: string;
  settledAt: string | null;
}

// ─── Service Functions ───────────────────────────────────────────────

/**
 * Request a live FX quote from Circle StableFX and map it
 * into the WizPay-internal FxQuote shape.
 *
 * If recipientAddress is provided, requests a "tradable" quote
 * that includes Permit2 typedData for signing. Otherwise, returns
 * a "reference" quote (rate check only, not executable).
 */
export async function requestQuote(req: FxQuoteRequest): Promise<FxQuote> {
  const isTradable = !!req.recipientAddress;

  const circleRes = await createQuote({
    from: {
      currency: req.sourceCurrency,
      amount: req.sourceAmount,
    },
    to: {
      currency: req.targetCurrency,
    },
    tenor: "instant",
    type: isTradable ? "tradable" : "reference",
    ...(isTradable ? { recipientAddress: req.recipientAddress } : {}),
  });

  // Circle returns `rate` (number) and `fee` (string in "to" currency)
  const q = circleRes;

  return {
    quoteId: q.id,
    sourceCurrency: q.from.currency,
    targetCurrency: q.to.currency,
    sourceAmount: q.from.amount,
    targetAmount: q.to.amount,
    exchangeRate: String(q.rate),
    feeAmount: q.fee,
    feeCurrency: q.to.currency, // Circle fee is denominated in "to" currency
    expiresAt: q.expiresAt,
    provider: "circle-stablefx",
    ...(q.typedData ? { typedData: q.typedData } : {}),
  };
}

/**
 * Execute a previously quoted FX trade through Circle StableFX.
 *
 * ── Permit2 flow ──
 * The signature parameter is the user's EIP-712 signature over the
 * typedData returned in the quote response. The flow is:
 *   1. Frontend calls requestQuote() with recipientAddress → gets typedData.
 *   2. Frontend prompts user to sign typedData via eth_signTypedData_v4.
 *   3. Frontend calls executeTrade() with the hex signature.
 *   4. Circle's FxEscrow contract pulls tokens via Permit2 and settles.
 */
export async function executeTrade(req: FxTradeRequest): Promise<FxTrade> {
  const circleRes = await createTrade({
    quoteId: req.quoteId,
    signature: req.signature,
  });

  const t = circleRes;

  return {
    tradeId: t.id,
    quoteId: t.quoteId,
    status: normalizeStatus(t.status),
    sourceCurrency: t.from.currency,
    targetCurrency: t.to.currency,
    sourceAmount: t.from.amount,
    targetAmount: t.to.amount,
    exchangeRate: String(t.rate),
    senderAddress: req.senderAddress,
    referenceId: req.referenceId || "",
    createdAt: t.createdAt,
    settledAt: t.settledAt ?? null,
  };
}

/**
 * Check the settlement status of an in-flight trade.
 */
export async function getTradeStatus(tradeId: string): Promise<FxTrade> {
  const circleRes = await getTradeById(tradeId);

  const t = circleRes;

  return {
    tradeId: t.id,
    quoteId: t.quoteId,
    status: normalizeStatus(t.status),
    sourceCurrency: t.from.currency,
    targetCurrency: t.to.currency,
    sourceAmount: t.from.amount,
    targetAmount: t.to.amount,
    exchangeRate: String(t.rate),
    senderAddress: "",
    referenceId: "",
    createdAt: t.createdAt,
    settledAt: t.settledAt ?? null,
  };
}

// ─── Re-export for route handlers ───────────────────────────────────

export { CircleApiError };

// ─── Helpers ────────────────────────────────────────────────────────

function normalizeStatus(
  raw: string
): "pending" | "processing" | "settled" | "failed" {
  const s = raw.toLowerCase();
  if (s === "settled" || s === "complete" || s === "completed") return "settled";
  if (s === "failed" || s === "expired" || s === "cancelled") return "failed";
  if (s === "processing" || s === "executing") return "processing";
  return "pending";
}
