import type { CircleTransferBlockchain } from "@/lib/server/circle-transfer";

const CHAIN_ENV_SUFFIX: Record<CircleTransferBlockchain, string> = {
  "ARC-TESTNET": "ARC_TESTNET",
  "ETH-SEPOLIA": "ETH_SEPOLIA",
};

export function normalizeCircleWalletChain(
  chain: string | undefined
): CircleTransferBlockchain {
  const normalizedChain = (chain || "ARC-TESTNET").toUpperCase();

  if (
    normalizedChain === "ARC-TESTNET" ||
    normalizedChain === "ETH-SEPOLIA"
  ) {
    return normalizedChain;
  }

  throw new Error(`Unsupported Circle wallet chain ${chain}.`);
}

export function getWalletEnvName(baseName: string, chain: string): string {
  const normalizedChain = normalizeCircleWalletChain(chain);

  return `${baseName}_${CHAIN_ENV_SUFFIX[normalizedChain]}`;
}

export function getWalletIdByChain(chain: string): string {
  return getChainWalletValue("CIRCLE_WALLET_ID", chain);
}

export function getWalletAddressByChain(chain: string): string {
  return getChainWalletValue("CIRCLE_WALLET_ADDRESS", chain);
}

export function getWalletSetIdByChain(chain: string): string {
  return getChainWalletValue("CIRCLE_WALLET_SET_ID", chain);
}

function getChainWalletValue(baseName: string, chain: string): string {
  const envName = getWalletEnvName(baseName, chain);

  return normalizeOptionalString(process.env[envName]) || "";
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue || undefined;
}