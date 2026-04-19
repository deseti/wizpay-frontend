import { ArcTestnet } from "@circle-fin/app-kit/chains";
import { ViemAdapter } from "@circle-fin/adapter-viem-v2";
import {
  SwapChain,
  SwapKit,
  type SwapEstimate,
  type SwapResult,
} from "@circle-fin/swap-kit";
import type { PublicClient, WalletClient } from "viem";

export type CircleSwapToken = "USDC" | "EURC";

export const CIRCLE_SWAP_TOKENS: Array<{
  symbol: CircleSwapToken;
  label: string;
}> = [
  { symbol: "USDC", label: "USDC - USD Coin" },
  { symbol: "EURC", label: "EURC - Euro Coin" },
];

const swapKit = new SwapKit();

export function getCircleKitKey(): string {
  return process.env.NEXT_PUBLIC_CIRCLE_KIT_KEY ?? "";
}

export function createArcSwapAdapter(
  publicClient: PublicClient | undefined,
  walletClient: WalletClient | undefined
) {
  if (!publicClient || !walletClient) {
    return null;
  }

  return new ViemAdapter(
    {
      getPublicClient: () => publicClient,
      getWalletClient: async () => walletClient,
    },
    {
      addressContext: "user-controlled",
      supportedChains: [ArcTestnet],
    }
  );
}

function buildSwapParams(params: {
  adapter: ReturnType<typeof createArcSwapAdapter>;
  tokenIn: CircleSwapToken;
  tokenOut: CircleSwapToken;
  amountIn: string;
  slippageBps: number;
  kitKey: string;
}) {
  const { adapter, tokenIn, tokenOut, amountIn, slippageBps, kitKey } = params;

  if (!adapter) {
    throw new Error("Swap adapter is not ready. Connect your Arc wallet first.");
  }

  return {
    from: {
      adapter,
      chain: SwapChain.Arc_Testnet,
    },
    tokenIn,
    tokenOut,
    amountIn,
    config: {
      allowanceStrategy: "permit" as const,
      kitKey,
      slippageBps,
    },
  };
}

export async function estimateArcSwap(params: {
  adapter: ReturnType<typeof createArcSwapAdapter>;
  tokenIn: CircleSwapToken;
  tokenOut: CircleSwapToken;
  amountIn: string;
  slippageBps: number;
  kitKey: string;
}): Promise<SwapEstimate> {
  return swapKit.estimate(buildSwapParams(params));
}

export async function executeArcSwap(params: {
  adapter: ReturnType<typeof createArcSwapAdapter>;
  tokenIn: CircleSwapToken;
  tokenOut: CircleSwapToken;
  amountIn: string;
  slippageBps: number;
  kitKey: string;
}): Promise<SwapResult> {
  return swapKit.swap(buildSwapParams(params));
}