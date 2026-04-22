import { createConfig, fallback, http } from "wagmi";
import { injected } from "@wagmi/core";
import { defineChain, type Chain } from "viem";
import { sepolia } from "viem/chains";

const DEFAULT_ARC_TESTNET_RPC_URLS = [
  "https://rpc.testnet.arc.network",
  "https://rpc.quicknode.testnet.arc.network",
  "https://rpc.blockdaemon.testnet.arc.network",
];

const DEFAULT_ETHEREUM_SEPOLIA_RPC_URLS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://ethereum-sepolia.publicnode.com",
];

function parseRpcUrls(
  explicitUrl: string | undefined,
  explicitList: string | undefined,
  defaults: string[]
) {
  const configured = [explicitList, explicitUrl]
    .flatMap((value) =>
      (value ?? "")
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    );

  return Array.from(new Set(configured.length > 0 ? configured : defaults));
}

function createFallbackTransport(urls: string[]) {
  return fallback(
    urls.map((url) =>
      http(url, {
        retryCount: 1,
        timeout: 10_000,
      })
    )
  );
}

export const ARC_TESTNET_RPC_URLS = parseRpcUrls(
  process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL,
  process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URLS,
  DEFAULT_ARC_TESTNET_RPC_URLS
);

export const ARC_TESTNET_RPC_URL = ARC_TESTNET_RPC_URLS[0];

export const ETHEREUM_SEPOLIA_RPC_URLS = parseRpcUrls(
  process.env.NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC_URL,
  process.env.NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC_URLS,
  DEFAULT_ETHEREUM_SEPOLIA_RPC_URLS
);

export const ETHEREUM_SEPOLIA_RPC_URL = ETHEREUM_SEPOLIA_RPC_URLS[0];

/**
 * Arc Testnet — custom chain definition
 */
export const arcTestnet = defineChain({
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ARC_TESTNET_RPC_URLS,
    },
    public: {
      http: ARC_TESTNET_RPC_URLS,
    },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: "https://testnet.arcscan.app",
    },
  },
  testnet: true,
});

export const ethereumSepolia = defineChain({
  ...sepolia,
  rpcUrls: {
    ...sepolia.rpcUrls,
    default: {
      http: ETHEREUM_SEPOLIA_RPC_URLS,
    },
    public: {
      http: ETHEREUM_SEPOLIA_RPC_URLS,
    },
  },
});

export const SUPPORTED_CHAINS = [arcTestnet, ethereumSepolia] as const;
export const CHAIN_BY_ID: Record<number, Chain> = {
  [arcTestnet.id]: arcTestnet,
  [ethereumSepolia.id]: ethereumSepolia,
};
export const CHAIN_NAME_BY_ID: Record<number, string> = {
  [arcTestnet.id]: arcTestnet.name,
  [ethereumSepolia.id]: ethereumSepolia.name,
};
export const SUPPORTED_CHAIN_IDS = new Set<number>(
  SUPPORTED_CHAINS.map((chain) => chain.id)
);

const connectors = [
  injected({
    shimDisconnect: true,
  }),
];

/**
 * Wagmi configuration for both public reads and RainbowKit external wallets.
 * Circle user-controlled wallets remain isolated behind CircleWalletProvider.
 */
export const config = createConfig({
  chains: SUPPORTED_CHAINS,
  connectors,
  ssr: true,
  transports: {
    [arcTestnet.id]: createFallbackTransport(ARC_TESTNET_RPC_URLS),
    [ethereumSepolia.id]: createFallbackTransport(
      ETHEREUM_SEPOLIA_RPC_URLS
    ),
  },
});
