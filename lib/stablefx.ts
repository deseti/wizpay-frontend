/**
 * StableFX Service — Mock RFQ Engine
 *
 * Encapsulates all FX quoting and execution logic for WizPay.
 * Currently returns deterministic mock data that mirrors the shape
 * of a real Circle StableFX RFQ response so the frontend can
 * integrate against a stable contract today.
 *
 * ── Future migration path ──
 * 1. Replace `requestQuote` with a POST to Circle's StableFX /quotes endpoint.
 * 2. Replace `executeTrade` with a POST to /trades that references quote.id.
 * 3. Replace `getTradeStatus` with a GET to /trades/:tradeId.
 */

import { randomUUID } from "node:crypto";

// ─── Types ───────────────────────────────────────────────────────────

export interface FxQuoteRequest {
  sourceCurrency: string; // e.g. "USDC"
  targetCurrency: string; // e.g. "EURC"
  sourceAmount: string; // e.g. "1000.00"
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
}

export interface FxTradeRequest {
  quoteId: string;
  senderAddress: string;
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

// ─── Mock rate table (mirrors on-chain StableFXAdapter rates) ────────

const MOCK_RATES: Record<string, Record<string, number>> = {
  USDC: { EURC: 0.917, USYC: 1.0 },
  EURC: { USDC: 1.09, USYC: 1.09 },
  USYC: { USDC: 1.0, EURC: 0.917 },
};

const FEE_BPS = 25; // 0.25 % (matches on-chain lpFeeBps)

// ─── Service Functions ───────────────────────────────────────────────

export function requestQuote(req: FxQuoteRequest): FxQuote {
  const { sourceCurrency, targetCurrency, sourceAmount } = req;

  const rate = MOCK_RATES[sourceCurrency]?.[targetCurrency];
  if (rate === undefined) {
    throw new Error(
      `Unsupported pair: ${sourceCurrency} → ${targetCurrency}`
    );
  }

  // TODO: Replace with real Circle StableFX API call
  // const res = await circleClient.post("/stablefx/quotes", {
  //   sourceCurrency,
  //   targetCurrency,
  //   sourceAmount,
  // });
  // return mapCircleQuoteToFxQuote(res.data);

  const source = parseFloat(sourceAmount);
  const grossOut = source * rate;
  const fee = (grossOut * FEE_BPS) / 10_000;
  const netOut = grossOut - fee;

  return {
    quoteId: randomUUID(),
    sourceCurrency,
    targetCurrency,
    sourceAmount: source.toFixed(2),
    targetAmount: netOut.toFixed(2),
    exchangeRate: rate.toFixed(6),
    feeAmount: fee.toFixed(2),
    feeCurrency: targetCurrency,
    expiresAt: new Date(Date.now() + 30_000).toISOString(), // 30 s validity
    provider: "wizpay-mock-fx",
  };
}

export function executeTrade(req: FxTradeRequest): FxTrade {
  // TODO: Replace with real Circle StableFX API call
  // 1. Validate the quoteId hasn't expired
  // 2. Lock sender funds via Permit2
  // 3. Submit the settlement to Circle StableFX or on-chain escrow
  // 4. Return a pending trade that the client polls via getTradeStatus
  //
  // const res = await circleClient.post("/stablefx/trades", {
  //   quoteId: req.quoteId,
  //   senderAddress: req.senderAddress,
  //   referenceId: req.referenceId,
  // });
  // return mapCircleTradeToFxTrade(res.data);

  return {
    tradeId: randomUUID(),
    quoteId: req.quoteId,
    status: "processing",
    sourceCurrency: "USDC",
    targetCurrency: "EURC",
    sourceAmount: "1000.00",
    targetAmount: "914.58",
    exchangeRate: "0.917000",
    senderAddress: req.senderAddress,
    referenceId: req.referenceId || "",
    createdAt: new Date().toISOString(),
    settledAt: null,
  };
}

export function getTradeStatus(tradeId: string): FxTrade {
  // TODO: Replace with real Circle StableFX API call
  // const res = await circleClient.get(`/stablefx/trades/${tradeId}`);
  // return mapCircleTradeToFxTrade(res.data);

  return {
    tradeId,
    quoteId: "mock-quote-id",
    status: "settled",
    sourceCurrency: "USDC",
    targetCurrency: "EURC",
    sourceAmount: "1000.00",
    targetAmount: "914.58",
    exchangeRate: "0.917000",
    senderAddress: "0x0000000000000000000000000000000000000000",
    referenceId: "",
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    settledAt: new Date().toISOString(),
  };
}
