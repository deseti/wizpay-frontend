import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";

/**
 * Arc Testnet — custom chain definition
 */
export const arcTestnet = defineChain({
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "ARC",
    symbol: "ARC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.network"],
    },
  },
  blockExplorers: {
    default: {
      name: "Arc Explorer",
      url: "https://explorer.testnet.arc.network",
    },
  },
  testnet: true,
});

/**
 * Wagmi / RainbowKit configuration
 */
export const config = getDefaultConfig({
  appName: "WizPay",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "",
  chains: [arcTestnet],
  ssr: true, // required for Next.js App Router
});
