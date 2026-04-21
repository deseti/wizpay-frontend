"use client";

import type { Address } from "viem";

import { useCircleWallet } from "@/components/providers/CircleWalletProvider";
import { useHybridWallet } from "@/components/providers/HybridWalletProvider";
import type { WalletMode } from "@/lib/wallet-mode";

interface UseSmartWalletAddressResult {
  smartWalletAddress: Address | undefined;
  embeddedWalletAddress: Address | undefined;
  isLoadingSmartWalletAddress: boolean;
  walletLabel: string;
  walletMode: WalletMode;
}

export function useSmartWalletAddress(): UseSmartWalletAddressResult {
  const { authenticated } = useCircleWallet();
  const {
    activeWalletAddress,
    activeWalletLabel,
    isReady,
    walletMode,
  } = useHybridWallet();
  const isLoadingSmartWalletAddress =
    !isReady || (walletMode === "circle" && authenticated && !activeWalletAddress);

  return {
    smartWalletAddress: activeWalletAddress,
    embeddedWalletAddress: undefined,
    isLoadingSmartWalletAddress,
    walletLabel: activeWalletLabel,
    walletMode,
  };
}