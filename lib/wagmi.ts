import { createConfig } from "@privy-io/wagmi";
import { http } from "wagmi";
import { defineChain } from "viem";

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
      http: ["https://rpc.testnet.arc.network"],
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

/**
 * Wagmi configuration — synced with Privy auth state
 * Using createConfig from @privy-io/wagmi ensures wallet connections
 * are automatically driven by Privy's authentication.
 */
export const config = createConfig({
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(),
  },
});
