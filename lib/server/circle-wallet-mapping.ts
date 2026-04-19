import type { CircleTransferBlockchain } from "@/lib/server/circle-transfer";

interface CircleWalletEnvNames {
  walletAddressEnvName: string;
  walletIdEnvName: string;
  walletSetIdEnvName: string;
}

export interface CircleWalletByChain {
  chain: CircleTransferBlockchain;
  walletAddress: string;
  walletAddressEnvName: string;
  walletId: string;
  walletIdEnvName: string;
  walletSetId: string;
  walletSetIdEnvName: string;
}

const WALLET_ENV_NAMES_BY_CHAIN: Record<
  CircleTransferBlockchain,
  CircleWalletEnvNames
> = {
  "ARC-TESTNET": {
    walletAddressEnvName: "CIRCLE_WALLET_ADDRESS_ARC",
    walletIdEnvName: "CIRCLE_WALLET_ID_ARC",
    walletSetIdEnvName: "CIRCLE_WALLET_SET_ID_ARC",
  },
  "ETH-SEPOLIA": {
    walletAddressEnvName: "CIRCLE_WALLET_ADDRESS_SEPOLIA",
    walletIdEnvName: "CIRCLE_WALLET_ID_SEPOLIA",
    walletSetIdEnvName: "CIRCLE_WALLET_SET_ID_SEPOLIA",
  },
};

export function normalizeCircleWalletChain(
  chain: string | undefined
): CircleTransferBlockchain {
  const normalizedChain = (chain || "ARC-TESTNET").trim().toUpperCase();

  if (
    normalizedChain === "ARC-TESTNET" ||
    normalizedChain === "ETH-SEPOLIA"
  ) {
    return normalizedChain;
  }

  throw new Error(`Unsupported Circle wallet chain ${chain}.`);
}

export function getWalletByChain(chain: string): CircleWalletByChain {
  const normalizedChain = normalizeCircleWalletChain(chain);
  const envNames = WALLET_ENV_NAMES_BY_CHAIN[normalizedChain];

  return {
    chain: normalizedChain,
    walletAddress: getEnvValue(envNames.walletAddressEnvName),
    walletAddressEnvName: envNames.walletAddressEnvName,
    walletId: getEnvValue(envNames.walletIdEnvName),
    walletIdEnvName: envNames.walletIdEnvName,
    walletSetId: getEnvValue(envNames.walletSetIdEnvName),
    walletSetIdEnvName: envNames.walletSetIdEnvName,
  };
}

function getEnvValue(envName: string): string {
  return normalizeOptionalString(process.env[envName]) || "";
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue || undefined;
}