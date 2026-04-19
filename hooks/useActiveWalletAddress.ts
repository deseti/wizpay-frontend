"use client";

import type { Address } from "viem";

import { useCircleWallet } from "@/components/providers/CircleWalletProvider";

type ActiveWalletAddressResult = {
  isConnected: boolean;
  walletAddress: Address | undefined;
};

export function useActiveWalletAddress(): ActiveWalletAddressResult {
  const { arcWallet, authenticated, primaryWallet } = useCircleWallet();

  const walletAddress = (arcWallet?.address ??
    primaryWallet?.address) as Address | undefined;

  return {
    isConnected: authenticated && Boolean(walletAddress),
    walletAddress,
  };
}
