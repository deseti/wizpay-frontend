import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
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

/**
 * Wagmi configuration for public reads on Arc Testnet and Ethereum Sepolia.
 * Circle user-controlled wallets are handled outside wagmi, while read hooks
 * continue to use wagmi public clients.
 */
export const config = createConfig({
  chains: [arcTestnet, ethereumSepolia],
  ssr: true,
  transports: {
    [arcTestnet.id]: http(ARC_TESTNET_RPC_URL),
    [ethereumSepolia.id]: http(ETHEREUM_SEPOLIA_RPC_URL),
  },
});
