import { formatUnits, parseUnits, type Address } from "viem";

import { EURC_ADDRESS, USDC_ADDRESS } from "@/constants/addresses";

export type TokenSymbol = "USDC" | "EURC";

export interface TokenConfig {
  symbol: TokenSymbol;
  name: string;
  address: Address;
  decimals: number;
}

export interface RecipientDraft {
  id: string;
  address: string;
  amount: string;
  targetToken: TokenSymbol;
}

export const EXPLORER_BASE_URL = "https://testnet.arcscan.app";
export const PREVIEW_SLIPPAGE_BPS = 200n;
export const GAS_BUFFER_BPS = 1500n;
export const MAX_REFERENCE_ID_LENGTH = 64;

export const SUPPORTED_TOKENS: Record<TokenSymbol, TokenConfig> = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: USDC_ADDRESS,
    decimals: 6,
  },
  EURC: {
    symbol: "EURC",
    name: "Euro Coin",
    address: EURC_ADDRESS,
    decimals: 6,
  },
};

export const TOKEN_OPTIONS = Object.values(SUPPORTED_TOKENS);

export function createRecipient(targetToken: TokenSymbol): RecipientDraft {
  return {
    id: Math.random().toString(36).slice(2, 10),
    address: "",
    amount: "",
    targetToken,
  };
}

export function parseAmountToUnits(value: string, decimals: number): bigint {
  const normalized = value.trim();

  if (!normalized) {
    return 0n;
  }

  try {
    return parseUnits(normalized, decimals);
  } catch {
    return 0n;
  }
}

export function formatTokenAmount(
  value: bigint,
  decimals: number,
  maximumFractionDigits = 4
): string {
  return Number(formatUnits(value, decimals)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  });
}

export function formatCompactAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function isTransactionHash(value: string | null | undefined): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{64}$/.test(value ?? "");
}

export function getExplorerTxUrl(hash: string | null | undefined) {
  return isTransactionHash(hash) ? `${EXPLORER_BASE_URL}/tx/${hash}` : null;
}

export function sameAddress(left?: string, right?: string): boolean {
  return left?.toLowerCase() === right?.toLowerCase();
}

export function getFriendlyErrorMessage(error: unknown): string {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  const message = rawMessage.toLowerCase();

  if (message.includes("user rejected") || message.includes("rejected the request")) {
    return "Transaction was rejected in your wallet.";
  }

  if (message.includes("insufficient allowance") || message.includes("transferfrom failed")) {
    return "Insufficient allowance. Approve the gross batch amount and wait for on-chain confirmation before sending.";
  }

  if (message.includes("insufficient balance")) {
    return "Insufficient token balance for this batch.";
  }

  if (
    message.includes("standard circle rest api key prefix")
  ) {
    return "CIRCLE_API_KEY is using the wrong key type. Use a Circle REST API key with TEST_API_KEY or LIVE_API_KEY prefix in frontend/.env.local.";
  }

  if (
    message.includes("accepted this api key for general apis") ||
    message.includes("not enabled for stablefx yet") ||
    message.includes("not permitted to use stablefx")
  ) {
    return "Circle accepted this API key for general APIs, but StableFX is not enabled on the current Circle account or key yet. Enable StableFX access in Circle Developer Console.";
  }

  if (
    message.includes("stablefx api key") ||
    message.includes("missing_api_key") ||
    message.includes("401 unauthorized")
  ) {
    return "Circle StableFX is not authorized for the configured API key. Update CIRCLE_API_KEY with a StableFX-enabled key in frontend/.env.local.";
  }

  if (message.includes("exchange rate not set")) {
    return "Swap failed. The selected token pair does not have an active route in StableFX.";
  }

  if (message.includes("insufficient liquidity")) {
    return "Swap failed. StableFX does not have enough output-token liquidity for at least one recipient.";
  }

  if (message.includes("slippage")) {
    return "Swap failed because the quoted output moved below the allowed minimum.";
  }

  if (message.includes("referenceid required")) {
    return "Reference ID is required before the batch can be submitted.";
  }

  if (message.includes("referenceid too long")) {
    return `Reference ID must be ${MAX_REFERENCE_ID_LENGTH} characters or less.`;
  }

  if (message.includes("array length mismatch")) {
    return "The batch payload is inconsistent. Please review every recipient row.";
  }

  if (message.includes("batch too large")) {
    return "A batch can contain at most 50 recipients.";
  }

  if (message.includes("execution reverted")) {
    return rawMessage.slice(0, 220);
  }

  return rawMessage.slice(0, 220);
}
