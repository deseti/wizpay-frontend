"use client";

import type { Address } from "viem";
import type { WalletMode } from "@/lib/wallet-mode";

import { useHybridWallet } from "@/components/providers/HybridWalletProvider";

type ActiveWalletAddressResult = {
  isConnected: boolean;
  walletMode: WalletMode;
  walletAddress: Address | undefined;
};

export function useActiveWalletAddress(): ActiveWalletAddressResult {
  const { activeWalletAddress, isActiveWalletConnected, walletMode } =
    useHybridWallet();

  return {
    isConnected: isActiveWalletConnected,
    walletAddress: activeWalletAddress,
    walletMode,
  };
}
