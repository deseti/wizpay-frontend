"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";

import { useCircleWallet } from "@/components/providers/CircleWalletProvider";
import { useHybridWallet } from "@/components/providers/HybridWalletProvider";
import { ERC20_ABI } from "@/constants/erc20";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import { arcTestnet } from "@/lib/wagmi";
import {
  parseAmountToUnits,
  TOKEN_OPTIONS,
  type TokenSymbol,
} from "@/lib/wizpay";

/**
 * Fetches ERC-20 balances for all supported tokens (USDC, EURC)
 * for the connected wallet via multicall.
 */
export function useTokenBalances() {
  const { arcWallet, getWalletBalances, primaryWallet } = useCircleWallet();
  const { walletMode } = useHybridWallet();
  const { walletAddress } = useActiveWalletAddress();
  const circleWalletId = arcWallet?.id ?? primaryWallet?.id ?? null;

  const contracts = TOKEN_OPTIONS.map((token) => ({
    address: token.address,
    abi: ERC20_ABI,
    chainId: arcTestnet.id,
    functionName: "balanceOf" as const,
    args: walletAddress ? [walletAddress] : undefined,
  }));

  const circleBalancesQuery = useQuery({
    queryKey: ["circle-wallet-balances", circleWalletId ?? "disconnected"],
    enabled: walletMode === "circle" && Boolean(circleWalletId),
    refetchInterval: 15_000,
    staleTime: 10_000,
    queryFn: async () => {
      if (!circleWalletId) {
        return [];
      }

      return getWalletBalances(circleWalletId);
    },
  });

  const { data, isLoading, isError, error, refetch } = useReadContracts({
    contracts: walletMode === "external" && walletAddress ? contracts : [],
    query: {
      enabled: walletMode === "external" && Boolean(walletAddress),
      refetchInterval: 15_000,
    },
  });

  const balances: Record<TokenSymbol, bigint> = { USDC: 0n, EURC: 0n };

  if (walletMode === "circle") {
    (circleBalancesQuery.data ?? []).forEach((balance) => {
      const token =
        TOKEN_OPTIONS.find((candidate) => candidate.symbol === balance.symbol) ??
        TOKEN_OPTIONS.find(
          (candidate) =>
            candidate.address.toLowerCase() === balance.tokenAddress?.toLowerCase()
        );

      if (!token) {
        return;
      }

      balances[token.symbol] = parseAmountToUnits(balance.amount, token.decimals);
    });
  } else if (data) {
    TOKEN_OPTIONS.forEach((token, index) => {
      const result = data[index];
      if (result?.status === "success" && typeof result.result === "bigint") {
        balances[token.symbol] = result.result;
      }
    });
  }

  return {
    balances,
    error: walletMode === "circle" ? circleBalancesQuery.error : error,
    isError: walletMode === "circle" ? circleBalancesQuery.isError : isError,
    isLoading: walletMode === "circle" ? circleBalancesQuery.isLoading : isLoading,
    refetch: walletMode === "circle" ? circleBalancesQuery.refetch : refetch,
    source: walletMode,
  };
}
