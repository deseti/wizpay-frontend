import { createConfig, http } from "wagmi";
import { injected } from "@wagmi/core";
import { defineChain, type Chain } from "viem";
import { sepolia } from "viem/chains";

export const ARC_TESTNET_RPC_URL =
  process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL ||
  "https://rpc.testnet.arc.network";

export const ETHEREUM_SEPOLIA_RPC_URL =
  process.env.NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

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
      http: [ARC_TESTNET_RPC_URL],
    },
    public: {
      http: [ARC_TESTNET_RPC_URL],
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
      http: [ETHEREUM_SEPOLIA_RPC_URL],
    },
    public: {
      http: [ETHEREUM_SEPOLIA_RPC_URL],
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
    [arcTestnet.id]: http(ARC_TESTNET_RPC_URL),
    [ethereumSepolia.id]: http(ETHEREUM_SEPOLIA_RPC_URL),
  },
});
