"use client";

import type { Address } from "viem";
import { useCircleWallet } from "@/components/providers/CircleWalletProvider";

interface UseSmartWalletAddressResult {
  smartWalletAddress: Address | undefined;
  embeddedWalletAddress: Address | undefined;
  isLoadingSmartWalletAddress: boolean;
}

export function useSmartWalletAddress(): UseSmartWalletAddressResult {
  const { arcWallet, authenticated, primaryWallet, ready } = useCircleWallet();

  const smartWalletAddress = (arcWallet?.address ??
    primaryWallet?.address) as Address | undefined;
  const isLoadingSmartWalletAddress =
    !ready || (authenticated && !smartWalletAddress);

  return {
    smartWalletAddress,
    embeddedWalletAddress: undefined,
    isLoadingSmartWalletAddress,
  };
}