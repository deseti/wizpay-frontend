"use client";

import { useReadContracts } from "wagmi";
import { ERC20_ABI } from "@/constants/erc20";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import { TOKEN_OPTIONS, type TokenSymbol } from "@/lib/wizpay";

/**
 * Fetches ERC-20 balances for all supported tokens (USDC, EURC)
 * for the connected wallet via multicall.
 */
export function useTokenBalances() {
  const { walletAddress } = useActiveWalletAddress();

  const contracts = TOKEN_OPTIONS.map((token) => ({
    address: token.address,
    abi: ERC20_ABI,
    functionName: "balanceOf" as const,
    args: walletAddress ? [walletAddress] : undefined,
  }));

  const { data, isLoading, isError, error, refetch } = useReadContracts({
    contracts: walletAddress ? contracts : [],
    query: {
      enabled: Boolean(walletAddress),
      refetchInterval: 15_000,
    },
  });

  const balances: Record<TokenSymbol, bigint> = { USDC: 0n, EURC: 0n };

  if (data) {
    TOKEN_OPTIONS.forEach((token, index) => {
      const result = data[index];
      if (result?.status === "success" && typeof result.result === "bigint") {
        balances[token.symbol] = result.result;
      }
    });
  }

  return {
    balances,
    isLoading,
    isError,
    error,
    refetch,
  };
}
